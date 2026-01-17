import PD from 'node:crypto';
import gr from 'node:events';
import vD from 'node:net';
import bD from 'node:tls';
import el from 'node:timers/promises';
import gD from 'net';
import UD from 'dns/promises';
import GD from 'node:assert';
import YD from 'node:diagnostics_channel';
import BD from 'events';
import qD from 'node:url';
import HD from 'stream';
function jD(e, r) {
	for (var n = 0; n < r.length; n++) {
		const u = r[n];
		if (typeof u != 'string' && !Array.isArray(u)) {
			for (const t in u)
				if (t !== 'default' && !(t in e)) {
					const i = Object.getOwnPropertyDescriptor(u, t);
					i && Object.defineProperty(e, t, i.get ? i : { enumerable: !0, get: () => u[t] });
				}
		}
	}
	return Object.freeze(Object.defineProperty(e, Symbol.toStringTag, { value: 'Module' }));
}
var Ue = {},
	Ge = {},
	Kd = {},
	Br = {},
	iS;
function vM() {
	if (iS) return Br;
	((iS = 1), Object.defineProperty(Br, '__esModule', { value: !0 }), (Br.VerbatimString = void 0));
	class e extends String {
		format;
		constructor(n, u) {
			(super(u), (this.format = n));
		}
	}
	return ((Br.VerbatimString = e), Br);
}
var g = {},
	sS;
function qe() {
	if (sS) return g;
	((sS = 1),
		Object.defineProperty(g, '__esModule', { value: !0 }),
		(g.MultiErrorReply =
			g.CommandTimeoutDuringMaintenanceError =
			g.SocketTimeoutDuringMaintenanceError =
			g.TimeoutError =
			g.BlobError =
			g.SimpleError =
			g.ErrorReply =
			g.ReconnectStrategyError =
			g.RootNodesUnavailableError =
			g.SocketClosedUnexpectedlyError =
			g.DisconnectsClientError =
			g.ClientOfflineError =
			g.ClientClosedError =
			g.SocketTimeoutError =
			g.ConnectionTimeoutError =
			g.WatchError =
			g.AbortError =
				void 0));
	class e extends Error {
		constructor() {
			super('The command was aborted');
		}
	}
	g.AbortError = e;
	class r extends Error {
		constructor(E = 'One (or more) of the watched keys has been changed') {
			super(E);
		}
	}
	g.WatchError = r;
	class n extends Error {
		constructor() {
			super('Connection timeout');
		}
	}
	g.ConnectionTimeoutError = n;
	class u extends Error {
		constructor(E) {
			super(`Socket timeout timeout. Expecting data, but didn't receive any in ${E}ms.`);
		}
	}
	g.SocketTimeoutError = u;
	class t extends Error {
		constructor() {
			super('The client is closed');
		}
	}
	g.ClientClosedError = t;
	class i extends Error {
		constructor() {
			super('The client is offline');
		}
	}
	g.ClientOfflineError = i;
	class a extends Error {
		constructor() {
			super('Disconnects client');
		}
	}
	g.DisconnectsClientError = a;
	class s extends Error {
		constructor() {
			super('Socket closed unexpectedly');
		}
	}
	g.SocketClosedUnexpectedlyError = s;
	class o extends Error {
		constructor() {
			super('All the root nodes are unavailable');
		}
	}
	g.RootNodesUnavailableError = o;
	class f extends Error {
		originalError;
		socketError;
		constructor(E, T) {
			(super(E.message), (this.originalError = E), (this.socketError = T));
		}
	}
	g.ReconnectStrategyError = f;
	class d extends Error {}
	g.ErrorReply = d;
	class _ extends d {}
	g.SimpleError = _;
	class c extends d {}
	g.BlobError = c;
	class R extends Error {}
	g.TimeoutError = R;
	class h extends R {
		constructor(E) {
			super(`Socket timeout during maintenance. Expecting data, but didn't receive any in ${E}ms.`);
		}
	}
	g.SocketTimeoutDuringMaintenanceError = h;
	class S extends R {
		constructor(E) {
			super(`Command timeout during maintenance. Waited to write command for more than ${E}ms.`);
		}
	}
	g.CommandTimeoutDuringMaintenanceError = S;
	class O extends d {
		replies;
		errorIndexes;
		constructor(E, T) {
			(super(`${T.length} commands failed, see .replies and .errorIndexes for more information`), (this.replies = E), (this.errorIndexes = T));
		}
		*errors() {
			for (const E of this.errorIndexes) yield this.replies[E];
		}
	}
	return ((g.MultiErrorReply = O), g);
}
var aS;
function tl() {
	return (
		aS ||
			((aS = 1),
			(function (e) {
				var r;
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.Decoder = e.PUSH_TYPE_MAPPING = e.RESP_TYPES = void 0));
				const n = vM(),
					u = qe();
				e.RESP_TYPES = {
					NULL: 95,
					BOOLEAN: 35,
					NUMBER: 58,
					BIG_NUMBER: 40,
					DOUBLE: 44,
					SIMPLE_STRING: 43,
					BLOB_STRING: 36,
					VERBATIM_STRING: 61,
					SIMPLE_ERROR: 45,
					BLOB_ERROR: 33,
					ARRAY: 42,
					SET: 126,
					MAP: 37,
					PUSH: 62
				};
				const t = { '\r': 13, t: 116, '+': 43, '-': 45, 0: 48, '.': 46, i: 105, n: 110, E: 69, e: 101 };
				e.PUSH_TYPE_MAPPING = { [e.RESP_TYPES.BLOB_STRING]: Buffer };
				class i {
					onReply;
					onErrorReply;
					onPush;
					getTypeMapping;
					#e = 0;
					#t;
					constructor(s) {
						((this.onReply = s.onReply), (this.onErrorReply = s.onErrorReply), (this.onPush = s.onPush), (this.getTypeMapping = s.getTypeMapping));
					}
					reset() {
						((this.#e = 0), (this.#t = void 0));
					}
					write(s) {
						if (this.#e >= s.length) {
							this.#e -= s.length;
							return;
						}
						if (this.#t && (this.#t(s) || this.#e >= s.length)) {
							this.#e -= s.length;
							return;
						}
						do {
							const o = s[this.#e];
							if (++this.#e === s.length) {
								this.#t = this.#r.bind(this, o);
								break;
							}
							if (this.#n(o, s)) break;
						} while (this.#e < s.length);
						this.#e -= s.length;
					}
					#r(s, o) {
						return ((this.#t = void 0), this.#n(s, o));
					}
					#n(s, o) {
						switch (s) {
							case e.RESP_TYPES.NULL:
								return (this.onReply(this.#u()), !1);
							case e.RESP_TYPES.BOOLEAN:
								return this.#s(this.onReply, this.#i(o));
							case e.RESP_TYPES.NUMBER:
								return this.#s(this.onReply, this.#o(this.getTypeMapping()[e.RESP_TYPES.NUMBER], o));
							case e.RESP_TYPES.BIG_NUMBER:
								return this.#s(this.onReply, this.#c(this.getTypeMapping()[e.RESP_TYPES.BIG_NUMBER], o));
							case e.RESP_TYPES.DOUBLE:
								return this.#s(this.onReply, this.#O(this.getTypeMapping()[e.RESP_TYPES.DOUBLE], o));
							case e.RESP_TYPES.SIMPLE_STRING:
								return this.#s(this.onReply, this.#p(this.getTypeMapping()[e.RESP_TYPES.SIMPLE_STRING], o));
							case e.RESP_TYPES.BLOB_STRING:
								return this.#s(this.onReply, this.#D(this.getTypeMapping()[e.RESP_TYPES.BLOB_STRING], o));
							case e.RESP_TYPES.VERBATIM_STRING:
								return this.#s(this.onReply, this.#b(this.getTypeMapping()[e.RESP_TYPES.VERBATIM_STRING], o));
							case e.RESP_TYPES.SIMPLE_ERROR:
								return this.#s(this.onErrorReply, this.#V(o));
							case e.RESP_TYPES.BLOB_ERROR:
								return this.#s(this.onErrorReply, this.#x(o));
							case e.RESP_TYPES.ARRAY:
								return this.#s(this.onReply, this.#F(this.getTypeMapping(), o));
							case e.RESP_TYPES.SET:
								return this.#s(this.onReply, this.#Q(this.getTypeMapping(), o));
							case e.RESP_TYPES.MAP:
								return this.#s(this.onReply, this.#te(this.getTypeMapping(), o));
							case e.RESP_TYPES.PUSH:
								return this.#s(this.onPush, this.#F(e.PUSH_TYPE_MAPPING, o));
							default:
								throw new Error(`Unknown RESP type ${s} "${String.fromCharCode(s)}"`);
						}
					}
					#s(s, o) {
						return typeof o == 'function' ? ((this.#t = this.#a.bind(this, s, o)), !0) : (s(o), !1);
					}
					#a(s, o, f) {
						return ((this.#t = void 0), this.#s(s, o(f)));
					}
					#u() {
						return ((this.#e += 2), null);
					}
					#i(s) {
						const o = s[this.#e] === t.t;
						return ((this.#e += 3), o);
					}
					#o(s, o) {
						if (s === String) return this.#p(String, o);
						switch (o[this.#e]) {
							case t['+']:
								return this.#l(!1, o);
							case t['-']:
								return this.#l(!0, o);
							default:
								return this.#E(!1, this.#d.bind(this, 0), o);
						}
					}
					#l(s, o) {
						const f = this.#d.bind(this, 0);
						return ++this.#e === o.length ? this.#E.bind(this, s, f) : this.#E(s, f, o);
					}
					#E(s, o, f) {
						const d = o(f);
						return typeof d == 'function' ? this.#E.bind(this, s, d) : s ? -d : d;
					}
					#d(s, o) {
						let f = this.#e;
						do {
							const d = o[f];
							if (d === t['\r']) return ((this.#e = f + 2), s);
							s = s * 10 + d - t[0];
						} while (++f < o.length);
						return ((this.#e = f), this.#d.bind(this, s));
					}
					#c(s, o) {
						if (s === String) return this.#p(String, o);
						switch (o[this.#e]) {
							case t['+']:
								return this.#_(!1, o);
							case t['-']:
								return this.#_(!0, o);
							default:
								return this.#S(!1, this.#R.bind(this, 0n), o);
						}
					}
					#_(s, o) {
						const f = this.#R.bind(this, 0n);
						return ++this.#e === o.length ? this.#S.bind(this, s, f) : this.#S(s, f, o);
					}
					#S(s, o, f) {
						const d = o(f);
						return typeof d == 'function' ? this.#S.bind(this, s, d) : s ? -d : d;
					}
					#R(s, o) {
						let f = this.#e;
						do {
							const d = o[f];
							if (d === t['\r']) return ((this.#e = f + 2), s);
							s = s * 10n + BigInt(d - t[0]);
						} while (++f < o.length);
						return ((this.#e = f), this.#R.bind(this, s));
					}
					#O(s, o) {
						if (s === String) return this.#p(String, o);
						switch (o[this.#e]) {
							case t.n:
								return ((this.#e += 5), NaN);
							case t['+']:
								return this.#m(!1, o);
							case t['-']:
								return this.#m(!0, o);
							default:
								return this.#h(!1, 0, o);
						}
					}
					#m(s, o) {
						return ++this.#e === o.length ? this.#h.bind(this, s, 0) : this.#h(s, 0, o);
					}
					#h(s, o, f) {
						return f[this.#e] === t.i ? ((this.#e += 5), s ? -1 / 0 : 1 / 0) : this.#N(s, o, f);
					}
					#N(s, o, f) {
						let d = this.#e;
						do {
							const _ = f[d];
							switch (_) {
								case t['.']:
									return ((this.#e = d + 1), this.#e < f.length ? this.#T(s, 0, o, f) : this.#T.bind(this, s, 0, o));
								case t.E:
								case t.e:
									this.#e = d + 1;
									const c = s ? -o : o;
									return this.#e < f.length ? this.#C(c, f) : this.#C.bind(this, c);
								case t['\r']:
									return ((this.#e = d + 2), s ? -o : o);
								default:
									o = o * 10 + _ - t[0];
							}
						} while (++d < f.length);
						return ((this.#e = d), this.#N.bind(this, s, o));
					}
					static #A = [0.1, 0.01, 0.001, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12, 1e-13, 1e-14, 1e-15, 1e-16, 1e-17];
					#T(s, o, f, d) {
						let _ = this.#e;
						do {
							const c = d[_];
							switch (c) {
								case t.E:
								case t.e:
									this.#e = _ + 1;
									const R = s ? -f : f;
									return this.#e === d.length ? this.#C.bind(this, R) : this.#C(R, d);
								case t['\r']:
									return ((this.#e = _ + 2), s ? -f : f);
							}
							o < r.#A.length && (f += (c - t[0]) * r.#A[o++]);
						} while (++_ < d.length);
						return ((this.#e = _), this.#T.bind(this, s, o, f));
					}
					#C(s, o) {
						switch (o[this.#e]) {
							case t['+']:
								return ++this.#e === o.length ? this.#f.bind(this, !1, s, 0) : this.#f(!1, s, 0, o);
							case t['-']:
								return ++this.#e === o.length ? this.#f.bind(this, !0, s, 0) : this.#f(!0, s, 0, o);
						}
						return this.#f(!1, s, 0, o);
					}
					#f(s, o, f, d) {
						let _ = this.#e;
						do {
							const c = d[_];
							if (c === t['\r']) return ((this.#e = _ + 2), o * 10 ** (s ? -f : f));
							f = f * 10 + c - t[0];
						} while (++_ < d.length);
						return ((this.#e = _), this.#f.bind(this, s, o, f));
					}
					#M(s, o) {
						for (; s[o] !== t['\r']; ) if (++o === s.length) return ((this.#e = s.length), -1);
						return ((this.#e = o + 2), o);
					}
					#p(s, o) {
						const f = this.#e,
							d = this.#M(o, f);
						if (d === -1) return this.#y.bind(this, [o.subarray(f)], s);
						const _ = o.subarray(f, d);
						return s === Buffer ? _ : _.toString();
					}
					#y(s, o, f) {
						const d = this.#e,
							_ = this.#M(f, d);
						if (_ === -1) return (s.push(f.subarray(d)), this.#y.bind(this, s, o));
						s.push(f.subarray(d, _));
						const c = Buffer.concat(s);
						return o === Buffer ? c : c.toString();
					}
					#D(s, o) {
						if (o[this.#e] === t['-']) return ((this.#e += 4), null);
						const f = this.#d(0, o);
						return typeof f == 'function' ? this.#I.bind(this, f, s) : this.#e >= o.length ? this.#L.bind(this, f, s) : this.#L(f, s, o);
					}
					#I(s, o, f) {
						const d = s(f);
						return typeof d == 'function' ? this.#I.bind(this, d, o) : this.#e >= f.length ? this.#L.bind(this, d, o) : this.#L(d, o, f);
					}
					#v(s, o, f, d) {
						const _ = this.#e + s;
						if (_ >= d.length) {
							const R = d.subarray(this.#e);
							return ((this.#e = d.length), this.#Y.bind(this, s - R.length, [R], o, f));
						}
						const c = d.subarray(this.#e, _);
						return ((this.#e = _ + o), f === Buffer ? c : c.toString());
					}
					#Y(s, o, f, d, _) {
						const c = this.#e + s;
						if (c >= _.length) {
							const h = _.subarray(this.#e);
							return (o.push(h), (this.#e = _.length), this.#Y.bind(this, s - h.length, o, f, d));
						}
						(o.push(_.subarray(this.#e, c)), (this.#e = c + f));
						const R = Buffer.concat(o);
						return d === Buffer ? R : R.toString();
					}
					#L(s, o, f) {
						return this.#v(s, 2, o, f);
					}
					#b(s, o) {
						return this.#w(this.#d.bind(this, 0), s, o);
					}
					#w(s, o, f) {
						const d = s(f);
						return typeof d == 'function' ? this.#w.bind(this, d, o) : this.#oe(d, o, f);
					}
					#oe(s, o, f) {
						const d = s - 4;
						return o === n.VerbatimString ? this.#fe(d, f) : ((this.#e += 4), this.#e >= f.length ? this.#L.bind(this, d, o) : this.#L(d, o, f));
					}
					#fe(s, o) {
						const f = this.#v.bind(this, 3, 1, String);
						return this.#e >= o.length ? this.#H.bind(this, s, f) : this.#H(s, f, o);
					}
					#H(s, o, f) {
						const d = o(f);
						return typeof d == 'function' ? this.#H.bind(this, s, d) : this.#de(s, d, f);
					}
					#de(s, o, f) {
						return this.#X(o, this.#L.bind(this, s, String), f);
					}
					#X(s, o, f) {
						const d = o(f);
						return typeof d == 'function' ? this.#X.bind(this, s, d) : new n.VerbatimString(s, d);
					}
					#V(s) {
						const o = this.#p(String, s);
						return typeof o == 'function' ? this.#W.bind(this, o) : new u.SimpleError(o);
					}
					#W(s, o) {
						const f = s(o);
						return typeof f == 'function' ? this.#W.bind(this, f) : new u.SimpleError(f);
					}
					#x(s) {
						const o = this.#D(String, s);
						return typeof o == 'function' ? this.#Z.bind(this, o) : new u.BlobError(o);
					}
					#Z(s, o) {
						const f = s(o);
						return typeof f == 'function' ? this.#Z.bind(this, f) : new u.BlobError(f);
					}
					#P(s, o) {
						const f = o[this.#e];
						return ++this.#e === o.length ? this.#j.bind(this, f, s) : this.#j(f, s, o);
					}
					#j(s, o, f) {
						switch (s) {
							case e.RESP_TYPES.NULL:
								return this.#u();
							case e.RESP_TYPES.BOOLEAN:
								return this.#i(f);
							case e.RESP_TYPES.NUMBER:
								return this.#o(o[e.RESP_TYPES.NUMBER], f);
							case e.RESP_TYPES.BIG_NUMBER:
								return this.#c(o[e.RESP_TYPES.BIG_NUMBER], f);
							case e.RESP_TYPES.DOUBLE:
								return this.#O(o[e.RESP_TYPES.DOUBLE], f);
							case e.RESP_TYPES.SIMPLE_STRING:
								return this.#p(o[e.RESP_TYPES.SIMPLE_STRING], f);
							case e.RESP_TYPES.BLOB_STRING:
								return this.#D(o[e.RESP_TYPES.BLOB_STRING], f);
							case e.RESP_TYPES.VERBATIM_STRING:
								return this.#b(o[e.RESP_TYPES.VERBATIM_STRING], f);
							case e.RESP_TYPES.SIMPLE_ERROR:
								return this.#V(f);
							case e.RESP_TYPES.BLOB_ERROR:
								return this.#x(f);
							case e.RESP_TYPES.ARRAY:
								return this.#F(o, f);
							case e.RESP_TYPES.SET:
								return this.#Q(o, f);
							case e.RESP_TYPES.MAP:
								return this.#te(o, f);
							default:
								throw new Error(`Unknown RESP type ${s} "${String.fromCharCode(s)}"`);
						}
					}
					#F(s, o) {
						return o[this.#e] === t['-'] ? ((this.#e += 4), null) : this.#J(this.#d(0, o), s, o);
					}
					#J(s, o, f) {
						return typeof s == 'function' ? this.#le.bind(this, s, o) : this.#g(new Array(s), 0, o, f);
					}
					#le(s, o, f) {
						return this.#J(s(f), o, f);
					}
					#g(s, o, f, d) {
						for (let _ = o; _ < s.length; _++) {
							if (this.#e >= d.length) return this.#g.bind(this, s, _, f);
							const c = this.#P(f, d);
							if (typeof c == 'function') return this.#z.bind(this, s, _, c, f);
							s[_] = c;
						}
						return s;
					}
					#z(s, o, f, d, _) {
						const c = f(_);
						return typeof c == 'function' ? this.#z.bind(this, s, o, c, d) : ((s[o++] = c), this.#g(s, o, d, _));
					}
					#Q(s, o) {
						const f = this.#d(0, o);
						return typeof f == 'function' ? this.#k.bind(this, f, s) : this.#$(f, s, o);
					}
					#k(s, o, f) {
						const d = s(f);
						return typeof d == 'function' ? this.#k.bind(this, d, o) : this.#$(d, o, f);
					}
					#$(s, o, f) {
						return o[e.RESP_TYPES.SET] === Set ? this.#K(new Set(), s, o, f) : this.#g(new Array(s), 0, o, f);
					}
					#K(s, o, f, d) {
						for (; o > 0; ) {
							if (this.#e >= d.length) return this.#K.bind(this, s, o, f);
							const _ = this.#P(f, d);
							if (typeof _ == 'function') return this.#ee.bind(this, s, o, _, f);
							(s.add(_), --o);
						}
						return s;
					}
					#ee(s, o, f, d, _) {
						const c = f(_);
						return typeof c == 'function' ? this.#ee.bind(this, s, o, c, d) : (s.add(c), this.#K(s, o - 1, d, _));
					}
					#te(s, o) {
						const f = this.#d(0, o);
						return typeof f == 'function' ? this.#re.bind(this, f, s) : this.#ne(f, s, o);
					}
					#re(s, o, f) {
						const d = s(f);
						return typeof d == 'function' ? this.#re.bind(this, d, o) : this.#ne(d, o, f);
					}
					#ne(s, o, f) {
						switch (o[e.RESP_TYPES.MAP]) {
							case Map:
								return this.#B(new Map(), s, o, f);
							case Array:
								return this.#g(new Array(s * 2), 0, o, f);
							default:
								return this.#q(Object.create(null), s, o, f);
						}
					}
					#B(s, o, f, d) {
						for (; o > 0; ) {
							if (this.#e >= d.length) return this.#B.bind(this, s, o, f);
							const _ = this.#ue(f, d);
							if (typeof _ == 'function') return this.#se.bind(this, s, o, _, f);
							if (this.#e >= d.length) return this.#U.bind(this, s, o, _, this.#P.bind(this, f), f);
							const c = this.#P(f, d);
							if (typeof c == 'function') return this.#U.bind(this, s, o, _, c, f);
							(s.set(_, c), --o);
						}
						return s;
					}
					#ue(s, o) {
						const f = o[this.#e];
						return ++this.#e === o.length ? this.#ie.bind(this, f, s) : this.#ie(f, s, o);
					}
					#ie(s, o, f) {
						switch (s) {
							case e.RESP_TYPES.SIMPLE_STRING:
								return this.#p(String, f);
							case e.RESP_TYPES.BLOB_STRING:
								return this.#D(String, f);
							default:
								return this.#j(s, o, f);
						}
					}
					#se(s, o, f, d, _) {
						const c = f(_);
						if (typeof c == 'function') return this.#se.bind(this, s, o, c, d);
						if (this.#e >= _.length) return this.#U.bind(this, s, o, c, this.#P.bind(this, d), d);
						const R = this.#P(d, _);
						return typeof R == 'function' ? this.#U.bind(this, s, o, c, R, d) : (s.set(c, R), this.#B(s, o - 1, d, _));
					}
					#U(s, o, f, d, _, c) {
						const R = d(c);
						return typeof R == 'function' ? this.#U.bind(this, s, o, f, R, _) : (s.set(f, R), this.#B(s, o - 1, _, c));
					}
					#q(s, o, f, d) {
						for (; o > 0; ) {
							if (this.#e >= d.length) return this.#q.bind(this, s, o, f);
							const _ = this.#ue(f, d);
							if (typeof _ == 'function') return this.#ae.bind(this, s, o, _, f);
							if (this.#e >= d.length) return this.#G.bind(this, s, o, _, this.#P.bind(this, f), f);
							const c = this.#P(f, d);
							if (typeof c == 'function') return this.#G.bind(this, s, o, _, c, f);
							((s[_] = c), --o);
						}
						return s;
					}
					#ae(s, o, f, d, _) {
						const c = f(_);
						if (typeof c == 'function') return this.#ae.bind(this, s, o, c, d);
						if (this.#e >= _.length) return this.#G.bind(this, s, o, c, this.#P.bind(this, d), d);
						const R = this.#P(d, _);
						return typeof R == 'function' ? this.#G.bind(this, s, o, c, R, d) : ((s[c] = R), this.#q(s, o - 1, d, _));
					}
					#G(s, o, f, d, _, c) {
						const R = d(c);
						return typeof R == 'function' ? this.#G.bind(this, s, o, f, R, _) : ((s[f] = R), this.#q(s, o - 1, _, c));
					}
				}
				((e.Decoder = i), (r = i));
			})(Kd)),
		Kd
	);
}
var Qe = {},
	oS;
function FD() {
	if (oS) return Qe;
	((oS = 1), Object.defineProperty(Qe, '__esModule', { value: !0 }), (Qe.scriptSha1 = Qe.defineScript = void 0));
	const e = PD;
	function r(u) {
		return { ...u, SHA1: n(u.SCRIPT) };
	}
	Qe.defineScript = r;
	function n(u) {
		return (0, e.createHash)('sha1').update(u).digest('hex');
	}
	return ((Qe.scriptSha1 = n), Qe);
}
var ut = {},
	ee = {},
	rn = {},
	fS;
function KD() {
	return (
		fS ||
			((fS = 1),
			Object.defineProperty(rn, '__esModule', { value: !0 }),
			(rn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('ACL', 'CAT'), r && e.push(r));
				},
				transformReply: void 0
			})),
		rn
	);
}
var nn = {},
	dS;
function wD() {
	return (
		dS ||
			((dS = 1),
			Object.defineProperty(nn, '__esModule', { value: !0 }),
			(nn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('ACL', 'DELUSER'), e.pushVariadic(r));
				},
				transformReply: void 0
			})),
		nn
	);
}
var un = {},
	lS;
function XD() {
	return (
		lS ||
			((lS = 1),
			Object.defineProperty(un, '__esModule', { value: !0 }),
			(un.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('ACL', 'DRYRUN', r, ...n);
				},
				transformReply: void 0
			})),
		un
	);
}
var sn = {},
	cS;
function VD() {
	return (
		cS ||
			((cS = 1),
			Object.defineProperty(sn, '__esModule', { value: !0 }),
			(sn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('ACL', 'GENPASS'), r && e.push(r.toString()));
				},
				transformReply: void 0
			})),
		sn
	);
}
var an = {},
	_S;
function WD() {
	return (
		_S ||
			((_S = 1),
			Object.defineProperty(an, '__esModule', { value: !0 }),
			(an.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('ACL', 'GETUSER', r);
				},
				transformReply: {
					2: (e) => ({
						flags: e[1],
						passwords: e[3],
						commands: e[5],
						keys: e[7],
						channels: e[9],
						selectors: e[11]?.map((r) => {
							const n = r;
							return { commands: n[1], keys: n[3], channels: n[5] };
						})
					}),
					3: void 0
				}
			})),
		an
	);
}
var on = {},
	ES;
function xD() {
	return (
		ES ||
			((ES = 1),
			Object.defineProperty(on, '__esModule', { value: !0 }),
			(on.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('ACL', 'LIST');
				},
				transformReply: void 0
			})),
		on
	);
}
var fn = {},
	RS;
function ZD() {
	return (
		RS ||
			((RS = 1),
			Object.defineProperty(fn, '__esModule', { value: !0 }),
			(fn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('ACL', 'LOAD');
				},
				transformReply: void 0
			})),
		fn
	);
}
var it = {},
	dn = {},
	wd = {},
	qr = {},
	hS;
function He() {
	if (hS) return qr;
	((hS = 1), Object.defineProperty(qr, '__esModule', { value: !0 }), (qr.BasicCommandParser = void 0));
	class e {
		#e = [];
		#t = [];
		preserve;
		get redisArgs() {
			return this.#e;
		}
		get keys() {
			return this.#t;
		}
		get firstKey() {
			return this.#t[0];
		}
		get cacheKey() {
			const n = new Array(this.#e.length * 2);
			for (let u = 0; u < this.#e.length; u++) ((n[u] = this.#e[u].length), (n[u + this.#e.length] = this.#e[u]));
			return n.join('_');
		}
		push(...n) {
			this.#e.push(...n);
		}
		pushVariadic(n) {
			if (Array.isArray(n)) for (const u of n) this.push(u);
			else this.push(n);
		}
		pushVariadicWithLength(n) {
			(Array.isArray(n) ? this.#e.push(n.length.toString()) : this.#e.push('1'), this.pushVariadic(n));
		}
		pushVariadicNumber(n) {
			if (Array.isArray(n)) for (const u of n) this.push(u.toString());
			else this.push(n.toString());
		}
		pushKey(n) {
			(this.#t.push(n), this.#e.push(n));
		}
		pushKeysLength(n) {
			(Array.isArray(n) ? this.#e.push(n.length.toString()) : this.#e.push('1'), this.pushKeys(n));
		}
		pushKeys(n) {
			Array.isArray(n) ? (this.#t.push(...n), this.#e.push(...n)) : (this.#t.push(n), this.#e.push(n));
		}
	}
	return ((qr.BasicCommandParser = e), qr);
}
var SS;
function L() {
	return (
		SS ||
			((SS = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.transformRedisJsonNullReply =
						e.transformRedisJsonReply =
						e.transformRedisJsonArgument =
						e.transformStreamsMessagesReplyResp3 =
						e.transformStreamsMessagesReplyResp2 =
						e.transformStreamMessagesReply =
						e.transformStreamMessageNullReply =
						e.transformStreamMessageReply =
						e.parseArgs =
						e.parseZKeysArguments =
						e.transformRangeReply =
						e.parseSlotRangesArguments =
						e.transformFunctionListItemReply =
						e.RedisFunctionFlags =
						e.transformCommandReply =
						e.CommandCategories =
						e.CommandFlags =
						e.parseOptionalVariadicArgument =
						e.pushVariadicArgument =
						e.pushVariadicNumberArguments =
						e.pushVariadicArguments =
						e.pushEvalArguments =
						e.evalFirstKeyIndex =
						e.transformPXAT =
						e.transformEXAT =
						e.transformSortedSetReply =
						e.transformTuplesReply =
						e.createTransformTuplesReplyFunc =
						e.transformTuplesToMap =
						e.transformNullableDoubleReply =
						e.createTransformNullableDoubleReplyResp2Func =
						e.transformDoubleArrayReply =
						e.createTransformDoubleReplyResp2Func =
						e.transformDoubleReply =
						e.transformStringDoubleArgument =
						e.transformDoubleArgument =
						e.transformBooleanArrayReply =
						e.transformBooleanReply =
						e.isArrayReply =
						e.isNullReply =
							void 0));
				const r = He(),
					n = tl();
				function u(p) {
					return p === null;
				}
				e.isNullReply = u;
				function t(p) {
					return Array.isArray(p);
				}
				((e.isArrayReply = t),
					(e.transformBooleanReply = { 2: (p) => p === 1, 3: void 0 }),
					(e.transformBooleanArrayReply = { 2: (p) => p.map(e.transformBooleanReply[2]), 3: void 0 }));
				function i(p) {
					switch (p) {
						case 1 / 0:
							return '+inf';
						case -1 / 0:
							return '-inf';
						default:
							return p.toString();
					}
				}
				e.transformDoubleArgument = i;
				function a(p) {
					return typeof p != 'number' ? p : i(p);
				}
				((e.transformStringDoubleArgument = a),
					(e.transformDoubleReply = {
						2: (p, M, v) => {
							switch (v ? v[n.RESP_TYPES.DOUBLE] : void 0) {
								case String:
									return p;
								default: {
									let Y;
									switch (p.toString()) {
										case 'inf':
										case '+inf':
											Y = 1 / 0;
										case '-inf':
											Y = -1 / 0;
										case 'nan':
											Y = NaN;
										default:
											Y = Number(p);
									}
									return Y;
								}
							}
						},
						3: void 0
					}));
				function s(p, M) {
					return (v) => e.transformDoubleReply[2](v, p, M);
				}
				((e.createTransformDoubleReplyResp2Func = s), (e.transformDoubleArrayReply = { 2: (p, M, v) => p.map(s(M, v)), 3: void 0 }));
				function o(p, M) {
					return (v) => e.transformNullableDoubleReply[2](v, p, M);
				}
				((e.createTransformNullableDoubleReplyResp2Func = o),
					(e.transformNullableDoubleReply = { 2: (p, M, v) => (p === null ? null : e.transformDoubleReply[2](p, M, v)), 3: void 0 }));
				function f(p, M) {
					const v = Object.create(null);
					for (let G = 0; G < p.length; G += 2) v[p[G].toString()] = M(p[G + 1]);
					return v;
				}
				e.transformTuplesToMap = f;
				function d(p, M) {
					return (v) => _(v, p, M);
				}
				e.createTransformTuplesReplyFunc = d;
				function _(p, M, v) {
					const G = v ? v[n.RESP_TYPES.MAP] : void 0,
						Y = p;
					switch (G) {
						case Array:
							return p;
						case Map: {
							const H = new Map();
							for (let Z = 0; Z < Y.length; Z += 2) H.set(Y[Z].toString(), Y[Z + 1]);
							return H;
						}
						default: {
							const H = Object.create(null);
							for (let Z = 0; Z < Y.length; Z += 2) H[Y[Z].toString()] = Y[Z + 1];
							return H;
						}
					}
				}
				((e.transformTuplesReply = _),
					(e.transformSortedSetReply = {
						2: (p, M, v) => {
							const G = p,
								Y = [];
							for (let H = 0; H < G.length; H += 2) Y.push({ value: G[H], score: e.transformDoubleReply[2](G[H + 1], M, v) });
							return Y;
						},
						3: (p) =>
							p.map((M) => {
								const [v, G] = M;
								return { value: v, score: G };
							})
					}));
				function c(p) {
					return (typeof p == 'number' ? p : Math.floor(p.getTime() / 1e3)).toString();
				}
				e.transformEXAT = c;
				function R(p) {
					return (typeof p == 'number' ? p : p.getTime()).toString();
				}
				e.transformPXAT = R;
				function h(p) {
					return p?.keys?.[0];
				}
				e.evalFirstKeyIndex = h;
				function S(p, M) {
					return (M?.keys ? p.push(M.keys.length.toString(), ...M.keys) : p.push('0'), M?.arguments && p.push(...M.arguments), p);
				}
				e.pushEvalArguments = S;
				function O(p, M) {
					return (Array.isArray(M) ? (p = p.concat(M)) : p.push(M), p);
				}
				e.pushVariadicArguments = O;
				function l(p, M) {
					if (Array.isArray(M)) for (const v of M) p.push(v.toString());
					else p.push(M.toString());
					return p;
				}
				e.pushVariadicNumberArguments = l;
				function E(p, M) {
					return (Array.isArray(M) ? p.push(M.length.toString(), ...M) : p.push('1', M), p);
				}
				e.pushVariadicArgument = E;
				function T(p, M, v) {
					v !== void 0 && (p.push(M), p.pushVariadicWithLength(v));
				}
				e.parseOptionalVariadicArgument = T;
				var I;
				(function (p) {
					((p.WRITE = 'write'),
						(p.READONLY = 'readonly'),
						(p.DENYOOM = 'denyoom'),
						(p.ADMIN = 'admin'),
						(p.PUBSUB = 'pubsub'),
						(p.NOSCRIPT = 'noscript'),
						(p.RANDOM = 'random'),
						(p.SORT_FOR_SCRIPT = 'sort_for_script'),
						(p.LOADING = 'loading'),
						(p.STALE = 'stale'),
						(p.SKIP_MONITOR = 'skip_monitor'),
						(p.ASKING = 'asking'),
						(p.FAST = 'fast'),
						(p.MOVABLEKEYS = 'movablekeys'));
				})(I || (e.CommandFlags = I = {}));
				var P;
				(function (p) {
					((p.KEYSPACE = '@keyspace'),
						(p.READ = '@read'),
						(p.WRITE = '@write'),
						(p.SET = '@set'),
						(p.SORTEDSET = '@sortedset'),
						(p.LIST = '@list'),
						(p.HASH = '@hash'),
						(p.STRING = '@string'),
						(p.BITMAP = '@bitmap'),
						(p.HYPERLOGLOG = '@hyperloglog'),
						(p.GEO = '@geo'),
						(p.STREAM = '@stream'),
						(p.PUBSUB = '@pubsub'),
						(p.ADMIN = '@admin'),
						(p.FAST = '@fast'),
						(p.SLOW = '@slow'),
						(p.BLOCKING = '@blocking'),
						(p.DANGEROUS = '@dangerous'),
						(p.CONNECTION = '@connection'),
						(p.TRANSACTION = '@transaction'),
						(p.SCRIPTING = '@scripting'));
				})(P || (e.CommandCategories = P = {}));
				function D([p, M, v, G, Y, H, Z]) {
					return { name: p, arity: M, flags: new Set(v), firstKeyIndex: G, lastKeyIndex: Y, step: H, categories: new Set(Z) };
				}
				e.transformCommandReply = D;
				var m;
				(function (p) {
					((p.NO_WRITES = 'no-writes'), (p.ALLOW_OOM = 'allow-oom'), (p.ALLOW_STALE = 'allow-stale'), (p.NO_CLUSTER = 'no-cluster'));
				})(m || (e.RedisFunctionFlags = m = {}));
				function A(p) {
					return { libraryName: p[1], engine: p[3], functions: p[5].map((M) => ({ name: M[1], description: M[3], flags: M[5] })) };
				}
				e.transformFunctionListItemReply = A;
				function N(p, M) {
					p.push(M.start.toString(), M.end.toString());
				}
				function C(p, M) {
					if (Array.isArray(M)) for (const v of M) N(p, v);
					else N(p, M);
				}
				e.parseSlotRangesArguments = C;
				function y([p, M]) {
					return { start: p, end: M };
				}
				e.transformRangeReply = y;
				function b(p, M) {
					if (Array.isArray(M)) {
						if ((p.push(M.length.toString()), M.length))
							if (B(M)) p.pushKeys(M);
							else {
								for (let v = 0; v < M.length; v++) p.pushKey(M[v].key);
								p.push('WEIGHTS');
								for (let v = 0; v < M.length; v++) p.push(i(M[v].weight));
							}
					} else (p.push('1'), U(M) ? p.pushKey(M) : (p.pushKey(M.key), p.push('WEIGHTS', i(M.weight))));
				}
				e.parseZKeysArguments = b;
				function U(p) {
					return typeof p == 'string' || p instanceof Buffer;
				}
				function B(p) {
					return U(p[0]);
				}
				function X(p, ...M) {
					const v = new r.BasicCommandParser();
					p.parseCommand(v, ...M);
					const G = v.redisArgs;
					return (v.preserve && (G.preserve = v.preserve), G);
				}
				e.parseArgs = X;
				function x(p, M) {
					const [v, G, Y, H] = M;
					return {
						id: v,
						message: _(G, void 0, p),
						...(Y !== void 0 ? { millisElapsedFromDelivery: Y } : {}),
						...(H !== void 0 ? { deliveriesCounter: H } : {})
					};
				}
				e.transformStreamMessageReply = x;
				function ne(p, M) {
					return u(M) ? M : x(p, M);
				}
				e.transformStreamMessageNullReply = ne;
				function q(p, M) {
					return p.map(x.bind(void 0, M));
				}
				e.transformStreamMessagesReply = q;
				function V(p, M, v) {
					if (p === null) return null;
					switch (v ? v[n.RESP_TYPES.MAP] : void 0) {
						default: {
							const G = [];
							for (let Y = 0; Y < p.length; Y++) {
								const H = p[Y];
								G.push({ name: H[0], messages: q(H[1]) });
							}
							return G;
						}
					}
				}
				e.transformStreamsMessagesReplyResp2 = V;
				function F(p) {
					if (p === null) return null;
					if (p instanceof Map) {
						const M = new Map();
						for (const [v, G] of p) {
							const Y = v;
							M.set(Y.toString(), q(G));
						}
						return M;
					} else if (p instanceof Array) {
						const M = [];
						for (let v = 0; v < p.length; v += 2) {
							const G = p[v],
								Y = p[v + 1];
							(M.push(G), M.push(q(Y)));
						}
						return M;
					} else {
						const M = Object.create(null);
						for (const [v, G] of Object.entries(p)) M[v] = q(G);
						return M;
					}
				}
				e.transformStreamsMessagesReplyResp3 = F;
				function Q(p) {
					return JSON.stringify(p);
				}
				e.transformRedisJsonArgument = Q;
				function k(p) {
					return JSON.parse(p.toString());
				}
				e.transformRedisJsonReply = k;
				function tn(p) {
					return u(p) ? p : k(p);
				}
				e.transformRedisJsonNullReply = tn;
			})(wd)),
		wd
	);
}
var mS;
function bM() {
	if (mS) return dn;
	((mS = 1), Object.defineProperty(dn, '__esModule', { value: !0 }));
	const e = L();
	return (
		(dn.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('ACL', 'LOG'), n != null && r.push(n.toString()));
			},
			transformReply: {
				2: (r, n, u) =>
					r.map((t) => {
						const i = t;
						return {
							count: i[1],
							reason: i[3],
							context: i[5],
							object: i[7],
							username: i[9],
							'age-seconds': e.transformDoubleReply[2](i[11], n, u),
							'client-info': i[13],
							'entry-id': i[15],
							'timestamp-created': i[17],
							'timestamp-last-updated': i[19]
						};
					}),
				3: void 0
			}
		}),
		dn
	);
}
var OS;
function JD() {
	if (OS) return it;
	OS = 1;
	var e =
		(it && it.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(it, '__esModule', { value: !0 });
	const r = e(bM());
	return (
		(it.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n) {
				n.push('ACL', 'LOG', 'RESET');
			},
			transformReply: void 0
		}),
		it
	);
}
var ln = {},
	TS;
function zD() {
	return (
		TS ||
			((TS = 1),
			Object.defineProperty(ln, '__esModule', { value: !0 }),
			(ln.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('ACL', 'SAVE');
				},
				transformReply: void 0
			})),
		ln
	);
}
var cn = {},
	AS;
function QD() {
	return (
		AS ||
			((AS = 1),
			Object.defineProperty(cn, '__esModule', { value: !0 }),
			(cn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('ACL', 'SETUSER', r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		cn
	);
}
var _n = {},
	pS;
function kD() {
	return (
		pS ||
			((pS = 1),
			Object.defineProperty(_n, '__esModule', { value: !0 }),
			(_n.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('ACL', 'USERS');
				},
				transformReply: void 0
			})),
		_n
	);
}
var En = {},
	NS;
function $D() {
	return (
		NS ||
			((NS = 1),
			Object.defineProperty(En, '__esModule', { value: !0 }),
			(En.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('ACL', 'WHOAMI');
				},
				transformReply: void 0
			})),
		En
	);
}
var Rn = {},
	CS;
function ey() {
	return (
		CS ||
			((CS = 1),
			Object.defineProperty(Rn, '__esModule', { value: !0 }),
			(Rn.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					e.push('APPEND', r, n);
				},
				transformReply: void 0
			})),
		Rn
	);
}
var Xd = {},
	IS;
function gM() {
	return (
		IS ||
			((IS = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.ASKING_CMD = void 0),
					(e.ASKING_CMD = 'ASKING'),
					(e.default = {
						NOT_KEYED_COMMAND: !0,
						IS_READ_ONLY: !0,
						parseCommand(r) {
							r.push(e.ASKING_CMD);
						},
						transformReply: void 0
					}));
			})(Xd)),
		Xd
	);
}
var hn = {},
	LS;
function ty() {
	return (
		LS ||
			((LS = 1),
			Object.defineProperty(hn, '__esModule', { value: !0 }),
			(hn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, { username: r, password: n }) {
					(e.push('AUTH'), r !== void 0 && e.push(r), e.push(n));
				},
				transformReply: void 0
			})),
		hn
	);
}
var Sn = {},
	MS;
function ry() {
	return (
		MS ||
			((MS = 1),
			Object.defineProperty(Sn, '__esModule', { value: !0 }),
			(Sn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('BGREWRITEAOF');
				},
				transformReply: void 0
			})),
		Sn
	);
}
var mn = {},
	DS;
function ny() {
	return (
		DS ||
			((DS = 1),
			Object.defineProperty(mn, '__esModule', { value: !0 }),
			(mn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('BGSAVE'), r?.SCHEDULE && e.push('SCHEDULE'));
				},
				transformReply: void 0
			})),
		mn
	);
}
var On = {},
	yS;
function uy() {
	return (
		yS ||
			((yS = 1),
			Object.defineProperty(On, '__esModule', { value: !0 }),
			(On.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('BITCOUNT'), e.pushKey(r), n && (e.push(n.start.toString()), e.push(n.end.toString()), n.mode && e.push(n.mode)));
				},
				transformReply: void 0
			})),
		On
	);
}
var Tn = {},
	PS;
function iy() {
	return (
		PS ||
			((PS = 1),
			Object.defineProperty(Tn, '__esModule', { value: !0 }),
			(Tn.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('BITFIELD_RO'), e.pushKey(r));
					for (const u of n) (e.push('GET'), e.push(u.encoding), e.push(u.offset.toString()));
				},
				transformReply: void 0
			})),
		Tn
	);
}
var An = {},
	vS;
function sy() {
	return (
		vS ||
			((vS = 1),
			Object.defineProperty(An, '__esModule', { value: !0 }),
			(An.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('BITFIELD'), e.pushKey(r));
					for (const u of n)
						switch (u.operation) {
							case 'GET':
								e.push('GET', u.encoding, u.offset.toString());
								break;
							case 'SET':
								e.push('SET', u.encoding, u.offset.toString(), u.value.toString());
								break;
							case 'INCRBY':
								e.push('INCRBY', u.encoding, u.offset.toString(), u.increment.toString());
								break;
							case 'OVERFLOW':
								e.push('OVERFLOW', u.behavior);
								break;
						}
				},
				transformReply: void 0
			})),
		An
	);
}
var pn = {},
	bS;
function ay() {
	return (
		bS ||
			((bS = 1),
			Object.defineProperty(pn, '__esModule', { value: !0 }),
			(pn.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('BITOP', r), e.pushKey(n), e.pushKeys(u));
				},
				transformReply: void 0
			})),
		pn
	);
}
var Nn = {},
	gS;
function oy() {
	return (
		gS ||
			((gS = 1),
			Object.defineProperty(Nn, '__esModule', { value: !0 }),
			(Nn.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t, i) {
					(e.push('BITPOS'),
						e.pushKey(r),
						e.push(n.toString()),
						u !== void 0 && e.push(u.toString()),
						t !== void 0 && e.push(t.toString()),
						i && e.push(i));
				},
				transformReply: void 0
			})),
		Nn
	);
}
var Cn = {},
	US;
function fy() {
	return (
		US ||
			((US = 1),
			Object.defineProperty(Cn, '__esModule', { value: !0 }),
			(Cn.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t, i) {
					(e.push('BLMOVE'), e.pushKeys([r, n]), e.push(u, t, i.toString()));
				},
				transformReply: void 0
			})),
		Cn
	);
}
var ie = {},
	st = {},
	GS;
function UM() {
	if (GS) return st;
	((GS = 1), Object.defineProperty(st, '__esModule', { value: !0 }), (st.parseLMPopArguments = void 0));
	function e(r, n, u, t) {
		(r.pushKeysLength(n), r.push(u), t?.COUNT !== void 0 && r.push('COUNT', t.COUNT.toString()));
	}
	return (
		(st.parseLMPopArguments = e),
		(st.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, ...n) {
				(r.push('LMPOP'), e(r, ...n));
			},
			transformReply: void 0
		}),
		st
	);
}
var YS;
function dy() {
	if (YS) return ie;
	YS = 1;
	var e =
			(ie && ie.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(ie && ie.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(ie && ie.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(ie, '__esModule', { value: !0 });
	const u = n(UM());
	return (
		(ie.default = {
			IS_READ_ONLY: !1,
			parseCommand(t, i, ...a) {
				(t.push('BLMPOP', i.toString()), (0, u.parseLMPopArguments)(t, ...a));
			},
			transformReply: u.default.transformReply
		}),
		ie
	);
}
var In = {},
	BS;
function GM() {
	return (
		BS ||
			((BS = 1),
			Object.defineProperty(In, '__esModule', { value: !0 }),
			(In.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('BLPOP'), e.pushKeys(r), e.push(n.toString()));
				},
				transformReply(e) {
					return e === null ? null : { key: e[0], element: e[1] };
				}
			})),
		In
	);
}
var at = {},
	qS;
function ly() {
	if (qS) return at;
	qS = 1;
	var e =
		(at && at.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(at, '__esModule', { value: !0 });
	const r = e(GM());
	return (
		(at.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u, t) {
				(n.push('BRPOP'), n.pushKeys(u), n.push(t.toString()));
			},
			transformReply: r.default.transformReply
		}),
		at
	);
}
var Ln = {},
	HS;
function cy() {
	return (
		HS ||
			((HS = 1),
			Object.defineProperty(Ln, '__esModule', { value: !0 }),
			(Ln.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('BRPOPLPUSH'), e.pushKeys([r, n]), e.push(u.toString()));
				},
				transformReply: void 0
			})),
		Ln
	);
}
var se = {},
	ot = {},
	jS;
function YM() {
	if (jS) return ot;
	((jS = 1), Object.defineProperty(ot, '__esModule', { value: !0 }), (ot.parseZMPopArguments = void 0));
	const e = L();
	function r(n, u, t, i) {
		(n.pushKeysLength(u), n.push(t), i?.COUNT && n.push('COUNT', i.COUNT.toString()));
	}
	return (
		(ot.parseZMPopArguments = r),
		(ot.default = {
			IS_READ_ONLY: !1,
			parseCommand(n, u, t, i) {
				(n.push('ZMPOP'), r(n, u, t, i));
			},
			transformReply: {
				2(n, u, t) {
					return n === null
						? null
						: {
								key: n[0],
								members: n[1].map((i) => {
									const [a, s] = i;
									return { value: a, score: e.transformDoubleReply[2](s, u, t) };
								})
							};
				},
				3(n) {
					return n === null ? null : { key: n[0], members: e.transformSortedSetReply[3](n[1]) };
				}
			}
		}),
		ot
	);
}
var FS;
function _y() {
	if (FS) return se;
	FS = 1;
	var e =
			(se && se.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(se && se.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(se && se.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(se, '__esModule', { value: !0 });
	const u = n(YM());
	return (
		(se.default = {
			IS_READ_ONLY: !1,
			parseCommand(t, i, ...a) {
				(t.push('BZMPOP', i.toString()), (0, u.parseZMPopArguments)(t, ...a));
			},
			transformReply: u.default.transformReply
		}),
		se
	);
}
var Mn = {},
	KS;
function BM() {
	if (KS) return Mn;
	((KS = 1), Object.defineProperty(Mn, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Mn.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('BZPOPMAX'), r.pushKeys(n), r.push(u.toString()));
			},
			transformReply: {
				2(r, n, u) {
					return r === null ? null : { key: r[0], value: r[1], score: e.transformDoubleReply[2](r[2], n, u) };
				},
				3(r) {
					return r === null ? null : { key: r[0], value: r[1], score: r[2] };
				}
			}
		}),
		Mn
	);
}
var ft = {},
	wS;
function Ey() {
	if (wS) return ft;
	wS = 1;
	var e =
		(ft && ft.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(ft, '__esModule', { value: !0 });
	const r = e(BM());
	return (
		(ft.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u, t) {
				(n.push('BZPOPMIN'), n.pushKeys(u), n.push(t.toString()));
			},
			transformReply: r.default.transformReply
		}),
		ft
	);
}
var Dn = {},
	XS;
function Ry() {
	return (
		XS ||
			((XS = 1),
			Object.defineProperty(Dn, '__esModule', { value: !0 }),
			(Dn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLIENT', 'CACHING', r ? 'YES' : 'NO');
				},
				transformReply: void 0
			})),
		Dn
	);
}
var yn = {},
	VS;
function hy() {
	return (
		VS ||
			((VS = 1),
			Object.defineProperty(yn, '__esModule', { value: !0 }),
			(yn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLIENT', 'GETNAME');
				},
				transformReply: void 0
			})),
		yn
	);
}
var Pn = {},
	WS;
function Sy() {
	return (
		WS ||
			((WS = 1),
			Object.defineProperty(Pn, '__esModule', { value: !0 }),
			(Pn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLIENT', 'GETREDIR');
				},
				transformReply: void 0
			})),
		Pn
	);
}
var vn = {},
	xS;
function my() {
	return (
		xS ||
			((xS = 1),
			Object.defineProperty(vn, '__esModule', { value: !0 }),
			(vn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLIENT', 'ID');
				},
				transformReply: void 0
			})),
		vn
	);
}
var bn = {},
	ZS;
function qM() {
	if (ZS) return bn;
	((ZS = 1), Object.defineProperty(bn, '__esModule', { value: !0 }));
	const e = /([^\s=]+)=([^\s]*)/g;
	return (
		(bn.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r) {
				r.push('CLIENT', 'INFO');
			},
			transformReply(r) {
				const n = {};
				for (const t of r.toString().matchAll(e)) n[t[1]] = t[2];
				const u = {
					id: Number(n.id),
					addr: n.addr,
					fd: Number(n.fd),
					name: n.name,
					age: Number(n.age),
					idle: Number(n.idle),
					flags: n.flags,
					db: Number(n.db),
					sub: Number(n.sub),
					psub: Number(n.psub),
					multi: Number(n.multi),
					qbuf: Number(n.qbuf),
					qbufFree: Number(n['qbuf-free']),
					argvMem: Number(n['argv-mem']),
					obl: Number(n.obl),
					oll: Number(n.oll),
					omem: Number(n.omem),
					totMem: Number(n['tot-mem']),
					events: n.events,
					cmd: n.cmd,
					user: n.user,
					libName: n['lib-name'],
					libVer: n['lib-ver']
				};
				return (
					n.laddr !== void 0 && (u.laddr = n.laddr),
					n.redir !== void 0 && (u.redir = Number(n.redir)),
					n.ssub !== void 0 && (u.ssub = Number(n.ssub)),
					n['multi-mem'] !== void 0 && (u.multiMem = Number(n['multi-mem'])),
					n.resp !== void 0 && (u.resp = Number(n.resp)),
					u
				);
			}
		}),
		bn
	);
}
var Vd = {},
	JS;
function Oy() {
	return (
		JS ||
			((JS = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.CLIENT_KILL_FILTERS = void 0),
					(e.CLIENT_KILL_FILTERS = {
						ADDRESS: 'ADDR',
						LOCAL_ADDRESS: 'LADDR',
						ID: 'ID',
						TYPE: 'TYPE',
						USER: 'USER',
						SKIP_ME: 'SKIPME',
						MAXAGE: 'MAXAGE'
					}),
					(e.default = {
						NOT_KEYED_COMMAND: !0,
						IS_READ_ONLY: !0,
						parseCommand(n, u) {
							if ((n.push('CLIENT', 'KILL'), Array.isArray(u))) for (const t of u) r(n, t);
							else r(n, u);
						},
						transformReply: void 0
					}));
				function r(n, u) {
					if (u === e.CLIENT_KILL_FILTERS.SKIP_ME) {
						n.push('SKIPME');
						return;
					}
					switch ((n.push(u.filter), u.filter)) {
						case e.CLIENT_KILL_FILTERS.ADDRESS:
							n.push(u.address);
							break;
						case e.CLIENT_KILL_FILTERS.LOCAL_ADDRESS:
							n.push(u.localAddress);
							break;
						case e.CLIENT_KILL_FILTERS.ID:
							n.push(typeof u.id == 'number' ? u.id.toString() : u.id);
							break;
						case e.CLIENT_KILL_FILTERS.TYPE:
							n.push(u.type);
							break;
						case e.CLIENT_KILL_FILTERS.USER:
							n.push(u.username);
							break;
						case e.CLIENT_KILL_FILTERS.SKIP_ME:
							n.push(u.skipMe ? 'yes' : 'no');
							break;
						case e.CLIENT_KILL_FILTERS.MAXAGE:
							n.push(u.maxAge.toString());
							break;
					}
				}
			})(Vd)),
		Vd
	);
}
var dt = {},
	zS;
function Ty() {
	if (zS) return dt;
	zS = 1;
	var e =
		(dt && dt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(dt, '__esModule', { value: !0 });
	const r = e(qM());
	return (
		(dt.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(n, u) {
				(n.push('CLIENT', 'LIST'), u && (u.TYPE !== void 0 ? n.push('TYPE', u.TYPE) : (n.push('ID'), n.pushVariadic(u.ID))));
			},
			transformReply(n) {
				const u = n.toString().split(`
`),
					t = u.length - 1,
					i = [];
				for (let a = 0; a < t; a++) i.push(r.default.transformReply(u[a]));
				return i;
			}
		}),
		dt
	);
}
var gn = {},
	QS;
function Ay() {
	return (
		QS ||
			((QS = 1),
			Object.defineProperty(gn, '__esModule', { value: !0 }),
			(gn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLIENT', 'NO-EVICT', r ? 'ON' : 'OFF');
				},
				transformReply: void 0
			})),
		gn
	);
}
var Un = {},
	kS;
function py() {
	return (
		kS ||
			((kS = 1),
			Object.defineProperty(Un, '__esModule', { value: !0 }),
			(Un.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLIENT', 'NO-TOUCH', r ? 'ON' : 'OFF');
				},
				transformReply: void 0
			})),
		Un
	);
}
var Gn = {},
	$S;
function Ny() {
	return (
		$S ||
			(($S = 1),
			Object.defineProperty(Gn, '__esModule', { value: !0 }),
			(Gn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('CLIENT', 'PAUSE', r.toString()), n && e.push(n));
				},
				transformReply: void 0
			})),
		Gn
	);
}
var Yn = {},
	em;
function Cy() {
	return (
		em ||
			((em = 1),
			Object.defineProperty(Yn, '__esModule', { value: !0 }),
			(Yn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLIENT', 'SETNAME', r);
				},
				transformReply: void 0
			})),
		Yn
	);
}
var Bn = {},
	tm;
function Iy() {
	if (tm) return Bn;
	((tm = 1),
		Object.defineProperty(Bn, '__esModule', { value: !0 }),
		(Bn.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(u, t, i) {
				if ((u.push('CLIENT', 'TRACKING', t ? 'ON' : 'OFF'), t)) {
					if ((i?.REDIRECT && u.push('REDIRECT', i.REDIRECT.toString()), e(i))) {
						if ((u.push('BCAST'), i?.PREFIX))
							if (Array.isArray(i.PREFIX)) for (const a of i.PREFIX) u.push('PREFIX', a);
							else u.push('PREFIX', i.PREFIX);
					} else r(i) ? u.push('OPTIN') : n(i) && u.push('OPTOUT');
					i?.NOLOOP && u.push('NOLOOP');
				}
			},
			transformReply: void 0
		}));
	function e(u) {
		return u?.BCAST === !0;
	}
	function r(u) {
		return u?.OPTIN === !0;
	}
	function n(u) {
		return u?.OPTOUT === !0;
	}
	return Bn;
}
var qn = {},
	rm;
function Ly() {
	return (
		rm ||
			((rm = 1),
			Object.defineProperty(qn, '__esModule', { value: !0 }),
			(qn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLIENT', 'TRACKINGINFO');
				},
				transformReply: { 2: (e) => ({ flags: e[1], redirect: e[3], prefixes: e[5] }), 3: void 0 }
			})),
		qn
	);
}
var Hn = {},
	nm;
function My() {
	return (
		nm ||
			((nm = 1),
			Object.defineProperty(Hn, '__esModule', { value: !0 }),
			(Hn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLIENT', 'UNPAUSE');
				},
				transformReply: void 0
			})),
		Hn
	);
}
var jn = {},
	um;
function Dy() {
	return (
		um ||
			((um = 1),
			Object.defineProperty(jn, '__esModule', { value: !0 }),
			(jn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('CLUSTER', 'ADDSLOTS'), e.pushVariadicNumber(r));
				},
				transformReply: void 0
			})),
		jn
	);
}
var Fn = {},
	im;
function yy() {
	if (im) return Fn;
	((im = 1), Object.defineProperty(Fn, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Fn.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('CLUSTER', 'ADDSLOTSRANGE'), (0, e.parseSlotRangesArguments)(r, n));
			},
			transformReply: void 0
		}),
		Fn
	);
}
var Kn = {},
	sm;
function Py() {
	return (
		sm ||
			((sm = 1),
			Object.defineProperty(Kn, '__esModule', { value: !0 }),
			(Kn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'BUMPEPOCH');
				},
				transformReply: void 0
			})),
		Kn
	);
}
var wn = {},
	am;
function vy() {
	return (
		am ||
			((am = 1),
			Object.defineProperty(wn, '__esModule', { value: !0 }),
			(wn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'COUNT-FAILURE-REPORTS', r);
				},
				transformReply: void 0
			})),
		wn
	);
}
var Xn = {},
	om;
function by() {
	return (
		om ||
			((om = 1),
			Object.defineProperty(Xn, '__esModule', { value: !0 }),
			(Xn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'COUNTKEYSINSLOT', r.toString());
				},
				transformReply: void 0
			})),
		Xn
	);
}
var Vn = {},
	fm;
function gy() {
	return (
		fm ||
			((fm = 1),
			Object.defineProperty(Vn, '__esModule', { value: !0 }),
			(Vn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('CLUSTER', 'DELSLOTS'), e.pushVariadicNumber(r));
				},
				transformReply: void 0
			})),
		Vn
	);
}
var Wn = {},
	dm;
function Uy() {
	if (dm) return Wn;
	((dm = 1), Object.defineProperty(Wn, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Wn.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('CLUSTER', 'DELSLOTSRANGE'), (0, e.parseSlotRangesArguments)(r, n));
			},
			transformReply: void 0
		}),
		Wn
	);
}
var lt = {},
	lm;
function Gy() {
	return (
		lm ||
			((lm = 1),
			Object.defineProperty(lt, '__esModule', { value: !0 }),
			(lt.FAILOVER_MODES = void 0),
			(lt.FAILOVER_MODES = { FORCE: 'FORCE', TAKEOVER: 'TAKEOVER' }),
			(lt.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('CLUSTER', 'FAILOVER'), r?.mode && e.push(r.mode));
				},
				transformReply: void 0
			})),
		lt
	);
}
var xn = {},
	cm;
function Yy() {
	return (
		cm ||
			((cm = 1),
			Object.defineProperty(xn, '__esModule', { value: !0 }),
			(xn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'FLUSHSLOTS');
				},
				transformReply: void 0
			})),
		xn
	);
}
var Zn = {},
	_m;
function By() {
	return (
		_m ||
			((_m = 1),
			Object.defineProperty(Zn, '__esModule', { value: !0 }),
			(Zn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'FORGET', r);
				},
				transformReply: void 0
			})),
		Zn
	);
}
var Jn = {},
	Em;
function qy() {
	return (
		Em ||
			((Em = 1),
			Object.defineProperty(Jn, '__esModule', { value: !0 }),
			(Jn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('CLUSTER', 'GETKEYSINSLOT', r.toString(), n.toString());
				},
				transformReply: void 0
			})),
		Jn
	);
}
var zn = {},
	Rm;
function Hy() {
	return (
		Rm ||
			((Rm = 1),
			Object.defineProperty(zn, '__esModule', { value: !0 }),
			(zn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'INFO');
				},
				transformReply: void 0
			})),
		zn
	);
}
var Qn = {},
	hm;
function jy() {
	return (
		hm ||
			((hm = 1),
			Object.defineProperty(Qn, '__esModule', { value: !0 }),
			(Qn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'KEYSLOT', r);
				},
				transformReply: void 0
			})),
		Qn
	);
}
var kn = {},
	Sm;
function Fy() {
	return (
		Sm ||
			((Sm = 1),
			Object.defineProperty(kn, '__esModule', { value: !0 }),
			(kn.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'LINKS');
				},
				transformReply: {
					2: (e) =>
						e.map((r) => {
							const n = r;
							return { direction: n[1], node: n[3], 'create-time': n[5], events: n[7], 'send-buffer-allocated': n[9], 'send-buffer-used': n[11] };
						}),
					3: void 0
				}
			})),
		kn
	);
}
var $n = {},
	mm;
function Ky() {
	return (
		mm ||
			((mm = 1),
			Object.defineProperty($n, '__esModule', { value: !0 }),
			($n.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('CLUSTER', 'MEET', r, n.toString());
				},
				transformReply: void 0
			})),
		$n
	);
}
var eu = {},
	Om;
function wy() {
	return (
		Om ||
			((Om = 1),
			Object.defineProperty(eu, '__esModule', { value: !0 }),
			(eu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'MYID');
				},
				transformReply: void 0
			})),
		eu
	);
}
var tu = {},
	Tm;
function Xy() {
	return (
		Tm ||
			((Tm = 1),
			Object.defineProperty(tu, '__esModule', { value: !0 }),
			(tu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'MYSHARDID');
				},
				transformReply: void 0
			})),
		tu
	);
}
var ru = {},
	Am;
function Vy() {
	return (
		Am ||
			((Am = 1),
			Object.defineProperty(ru, '__esModule', { value: !0 }),
			(ru.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'NODES');
				},
				transformReply: void 0
			})),
		ru
	);
}
var nu = {},
	pm;
function Wy() {
	return (
		pm ||
			((pm = 1),
			Object.defineProperty(nu, '__esModule', { value: !0 }),
			(nu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'REPLICAS', r);
				},
				transformReply: void 0
			})),
		nu
	);
}
var uu = {},
	Nm;
function xy() {
	return (
		Nm ||
			((Nm = 1),
			Object.defineProperty(uu, '__esModule', { value: !0 }),
			(uu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'REPLICATE', r);
				},
				transformReply: void 0
			})),
		uu
	);
}
var iu = {},
	Cm;
function Zy() {
	return (
		Cm ||
			((Cm = 1),
			Object.defineProperty(iu, '__esModule', { value: !0 }),
			(iu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('CLUSTER', 'RESET'), r?.mode && e.push(r.mode));
				},
				transformReply: void 0
			})),
		iu
	);
}
var su = {},
	Im;
function Jy() {
	return (
		Im ||
			((Im = 1),
			Object.defineProperty(su, '__esModule', { value: !0 }),
			(su.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CLUSTER', 'SAVECONFIG');
				},
				transformReply: void 0
			})),
		su
	);
}
var au = {},
	Lm;
function zy() {
	return (
		Lm ||
			((Lm = 1),
			Object.defineProperty(au, '__esModule', { value: !0 }),
			(au.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('CLUSTER', 'SET-CONFIG-EPOCH', r.toString());
				},
				transformReply: void 0
			})),
		au
	);
}
var ct = {},
	Mm;
function Qy() {
	return (
		Mm ||
			((Mm = 1),
			Object.defineProperty(ct, '__esModule', { value: !0 }),
			(ct.CLUSTER_SLOT_STATES = void 0),
			(ct.CLUSTER_SLOT_STATES = { IMPORTING: 'IMPORTING', MIGRATING: 'MIGRATING', STABLE: 'STABLE', NODE: 'NODE' }),
			(ct.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('CLUSTER', 'SETSLOT', r.toString(), n), u && e.push(u));
				},
				transformReply: void 0
			})),
		ct
	);
}
var ou = {},
	Dm;
function ky() {
	if (Dm) return ou;
	((Dm = 1),
		Object.defineProperty(ou, '__esModule', { value: !0 }),
		(ou.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r) {
				r.push('CLUSTER', 'SLOTS');
			},
			transformReply(r) {
				return r.map(([n, u, t, ...i]) => ({ from: n, to: u, master: e(t), replicas: i.map(e) }));
			}
		}));
	function e(r) {
		const [n, u, t] = r;
		return { host: n, port: u, id: t };
	}
	return ou;
}
var fu = {},
	ym;
function $y() {
	return (
		ym ||
			((ym = 1),
			Object.defineProperty(fu, '__esModule', { value: !0 }),
			(fu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('COMMAND', 'COUNT');
				},
				transformReply: void 0
			})),
		fu
	);
}
var du = {},
	Pm;
function eP() {
	return (
		Pm ||
			((Pm = 1),
			Object.defineProperty(du, '__esModule', { value: !0 }),
			(du.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('COMMAND', 'GETKEYS'), e.push(...r));
				},
				transformReply: void 0
			})),
		du
	);
}
var lu = {},
	vm;
function tP() {
	return (
		vm ||
			((vm = 1),
			Object.defineProperty(lu, '__esModule', { value: !0 }),
			(lu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('COMMAND', 'GETKEYSANDFLAGS'), e.push(...r));
				},
				transformReply(e) {
					return e.map((r) => {
						const [n, u] = r;
						return { key: n, flags: u };
					});
				}
			})),
		lu
	);
}
var cu = {},
	bm;
function rP() {
	if (bm) return cu;
	((bm = 1), Object.defineProperty(cu, '__esModule', { value: !0 }));
	const e = L();
	return (
		(cu.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				r.push('COMMAND', 'INFO', ...n);
			},
			transformReply(r) {
				return r.map((n) => (n ? (0, e.transformCommandReply)(n) : null));
			}
		}),
		cu
	);
}
var _t = {},
	gm;
function nP() {
	return (
		gm ||
			((gm = 1),
			Object.defineProperty(_t, '__esModule', { value: !0 }),
			(_t.COMMAND_LIST_FILTER_BY = void 0),
			(_t.COMMAND_LIST_FILTER_BY = { MODULE: 'MODULE', ACLCAT: 'ACLCAT', PATTERN: 'PATTERN' }),
			(_t.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('COMMAND', 'LIST'), r?.FILTERBY && e.push('FILTERBY', r.FILTERBY.type, r.FILTERBY.value));
				},
				transformReply: void 0
			})),
		_t
	);
}
var _u = {},
	Um;
function uP() {
	if (Um) return _u;
	((Um = 1), Object.defineProperty(_u, '__esModule', { value: !0 }));
	const e = L();
	return (
		(_u.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r) {
				r.push('COMMAND');
			},
			transformReply(r) {
				return r.map(e.transformCommandReply);
			}
		}),
		_u
	);
}
var Eu = {},
	Gm;
function iP() {
	if (Gm) return Eu;
	((Gm = 1), Object.defineProperty(Eu, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Eu.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('CONFIG', 'GET'), r.pushVariadic(n));
			},
			transformReply: { 2: e.transformTuplesReply, 3: void 0 }
		}),
		Eu
	);
}
var Ru = {},
	Ym;
function sP() {
	return (
		Ym ||
			((Ym = 1),
			Object.defineProperty(Ru, '__esModule', { value: !0 }),
			(Ru.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CONFIG', 'RESETSTAT');
				},
				transformReply: void 0
			})),
		Ru
	);
}
var hu = {},
	Bm;
function aP() {
	return (
		Bm ||
			((Bm = 1),
			Object.defineProperty(hu, '__esModule', { value: !0 }),
			(hu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('CONFIG', 'REWRITE');
				},
				transformReply: void 0
			})),
		hu
	);
}
var Su = {},
	qm;
function oP() {
	return (
		qm ||
			((qm = 1),
			Object.defineProperty(Su, '__esModule', { value: !0 }),
			(Su.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, ...[r, n]) {
					if ((e.push('CONFIG', 'SET'), typeof r == 'string' || r instanceof Buffer)) e.push(r, n);
					else for (const [u, t] of Object.entries(r)) e.push(u, t);
				},
				transformReply: void 0
			})),
		Su
	);
}
var mu = {},
	Hm;
function fP() {
	return (
		Hm ||
			((Hm = 1),
			Object.defineProperty(mu, '__esModule', { value: !0 }),
			(mu.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('COPY'), e.pushKeys([r, n]), u?.DB && e.push('DB', u.DB.toString()), u?.REPLACE && e.push('REPLACE'));
				},
				transformReply: void 0
			})),
		mu
	);
}
var Ou = {},
	jm;
function dP() {
	return (
		jm ||
			((jm = 1),
			Object.defineProperty(Ou, '__esModule', { value: !0 }),
			(Ou.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('DBSIZE');
				},
				transformReply: void 0
			})),
		Ou
	);
}
var Tu = {},
	Fm;
function lP() {
	return (
		Fm ||
			((Fm = 1),
			Object.defineProperty(Tu, '__esModule', { value: !0 }),
			(Tu.default = {
				parseCommand(e, r) {
					(e.push('DECR'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Tu
	);
}
var Au = {},
	Km;
function cP() {
	return (
		Km ||
			((Km = 1),
			Object.defineProperty(Au, '__esModule', { value: !0 }),
			(Au.default = {
				parseCommand(e, r, n) {
					(e.push('DECRBY'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		Au
	);
}
var pu = {},
	wm;
function _P() {
	return (
		wm ||
			((wm = 1),
			Object.defineProperty(pu, '__esModule', { value: !0 }),
			(pu.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('DEL'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		pu
	);
}
var Et = {},
	Xm;
function EP() {
	return (
		Xm ||
			((Xm = 1),
			Object.defineProperty(Et, '__esModule', { value: !0 }),
			(Et.DelexCondition = void 0),
			(Et.DelexCondition = { IFEQ: 'IFEQ', IFNE: 'IFNE', IFDEQ: 'IFDEQ', IFDNE: 'IFDNE' }),
			(Et.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('DELEX'), e.pushKey(r), n && (e.push(n.condition), e.push(n.matchValue)));
				},
				transformReply: void 0
			})),
		Et
	);
}
var Nu = {},
	Vm;
function RP() {
	return (
		Vm ||
			((Vm = 1),
			Object.defineProperty(Nu, '__esModule', { value: !0 }),
			(Nu.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('DIGEST'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Nu
	);
}
var Cu = {},
	Wm;
function hP() {
	return (
		Wm ||
			((Wm = 1),
			Object.defineProperty(Cu, '__esModule', { value: !0 }),
			(Cu.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('DUMP'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Cu
	);
}
var Iu = {},
	xm;
function SP() {
	return (
		xm ||
			((xm = 1),
			Object.defineProperty(Iu, '__esModule', { value: !0 }),
			(Iu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('ECHO', r);
				},
				transformReply: void 0
			})),
		Iu
	);
}
var ae = {},
	Rt = {},
	Zm;
function Ur() {
	if (Zm) return Rt;
	((Zm = 1), Object.defineProperty(Rt, '__esModule', { value: !0 }), (Rt.parseEvalArguments = void 0));
	function e(r, n, u) {
		(r.push(n), u?.keys ? r.pushKeysLength(u.keys) : r.push('0'), u?.arguments && r.push(...u.arguments));
	}
	return (
		(Rt.parseEvalArguments = e),
		(Rt.default = {
			IS_READ_ONLY: !1,
			parseCommand(...r) {
				(r[0].push('EVAL'), e(...r));
			},
			transformReply: void 0
		}),
		Rt
	);
}
var Jm;
function mP() {
	if (Jm) return ae;
	Jm = 1;
	var e =
			(ae && ae.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(ae && ae.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(ae && ae.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(ae, '__esModule', { value: !0 });
	const u = n(Ur());
	return (
		(ae.default = {
			IS_READ_ONLY: !0,
			parseCommand(...t) {
				(t[0].push('EVAL_RO'), (0, u.parseEvalArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		ae
	);
}
var oe = {},
	zm;
function OP() {
	if (zm) return oe;
	zm = 1;
	var e =
			(oe && oe.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(oe && oe.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(oe && oe.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(oe, '__esModule', { value: !0 });
	const u = n(Ur());
	return (
		(oe.default = {
			IS_READ_ONLY: !0,
			parseCommand(...t) {
				(t[0].push('EVALSHA_RO'), (0, u.parseEvalArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		oe
	);
}
var fe = {},
	Qm;
function TP() {
	if (Qm) return fe;
	Qm = 1;
	var e =
			(fe && fe.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(fe && fe.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(fe && fe.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(fe, '__esModule', { value: !0 });
	const u = n(Ur());
	return (
		(fe.default = {
			IS_READ_ONLY: !1,
			parseCommand(...t) {
				(t[0].push('EVALSHA'), (0, u.parseEvalArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		fe
	);
}
var Lu = {},
	km;
function AP() {
	if (km) return Lu;
	((km = 1),
		Object.defineProperty(Lu, '__esModule', { value: !0 }),
		(Lu.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				if (
					(r.push('GEOADD'),
					r.pushKey(n),
					t?.condition ? r.push(t.condition) : t?.NX ? r.push('NX') : t?.XX && r.push('XX'),
					t?.CH && r.push('CH'),
					Array.isArray(u))
				)
					for (const i of u) e(r, i);
				else e(r, u);
			},
			transformReply: void 0
		}));
	function e(r, { longitude: n, latitude: u, member: t }) {
		r.push(n.toString(), u.toString(), t);
	}
	return Lu;
}
var Mu = {},
	$m;
function pP() {
	return (
		$m ||
			(($m = 1),
			Object.defineProperty(Mu, '__esModule', { value: !0 }),
			(Mu.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t) {
					(e.push('GEODIST'), e.pushKey(r), e.push(n, u), t && e.push(t));
				},
				transformReply(e) {
					return e === null ? null : Number(e);
				}
			})),
		Mu
	);
}
var Du = {},
	eO;
function NP() {
	return (
		eO ||
			((eO = 1),
			Object.defineProperty(Du, '__esModule', { value: !0 }),
			(Du.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('GEOHASH'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Du
	);
}
var yu = {},
	tO;
function CP() {
	return (
		tO ||
			((tO = 1),
			Object.defineProperty(yu, '__esModule', { value: !0 }),
			(yu.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('GEOPOS'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply(e) {
					return e.map((r) => {
						const n = r;
						return n === null ? null : { longitude: n[0], latitude: n[1] };
					});
				}
			})),
		yu
	);
}
var ht = {},
	J = {},
	St = {},
	Xe = {},
	rO;
function Gr() {
	if (rO) return Xe;
	((rO = 1), Object.defineProperty(Xe, '__esModule', { value: !0 }), (Xe.parseGeoSearchOptions = Xe.parseGeoSearchArguments = void 0));
	function e(n, u, t, i, a) {
		(n.pushKey(u),
			typeof t == 'string' || t instanceof Buffer ? n.push('FROMMEMBER', t) : n.push('FROMLONLAT', t.longitude.toString(), t.latitude.toString()),
			'radius' in i ? n.push('BYRADIUS', i.radius.toString(), i.unit) : n.push('BYBOX', i.width.toString(), i.height.toString(), i.unit),
			r(n, a));
	}
	Xe.parseGeoSearchArguments = e;
	function r(n, u) {
		(u?.SORT && n.push(u.SORT),
			u?.COUNT &&
				(typeof u.COUNT == 'number'
					? n.push('COUNT', u.COUNT.toString())
					: (n.push('COUNT', u.COUNT.value.toString()), u.COUNT.ANY && n.push('ANY'))));
	}
	return (
		(Xe.parseGeoSearchOptions = r),
		(Xe.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u, t, i, a) {
				(n.push('GEOSEARCH'), e(n, u, t, i, a));
			},
			transformReply: void 0
		}),
		Xe
	);
}
var nO;
function Pd() {
	if (nO) return St;
	((nO = 1), Object.defineProperty(St, '__esModule', { value: !0 }), (St.parseGeoRadiusArguments = void 0));
	const e = Gr();
	function r(n, u, t, i, a, s) {
		(n.pushKey(u), n.push(t.longitude.toString(), t.latitude.toString(), i.toString(), a), (0, e.parseGeoSearchOptions)(n, s));
	}
	return (
		(St.parseGeoRadiusArguments = r),
		(St.default = {
			IS_READ_ONLY: !1,
			parseCommand(...n) {
				return (n[0].push('GEORADIUS'), r(...n));
			},
			transformReply: void 0
		}),
		St
	);
}
var Hr = {},
	uO;
function vd() {
	return (
		uO ||
			((uO = 1),
			(function (e) {
				var r =
					(Hr && Hr.__importDefault) ||
					function (u) {
						return u && u.__esModule ? u : { default: u };
					};
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.GEO_REPLY_WITH = void 0));
				const n = r(Gr());
				((e.GEO_REPLY_WITH = { DISTANCE: 'WITHDIST', HASH: 'WITHHASH', COORDINATES: 'WITHCOORD' }),
					(e.default = {
						IS_READ_ONLY: n.default.IS_READ_ONLY,
						parseCommand(u, t, i, a, s, o) {
							(n.default.parseCommand(u, t, i, a, o), u.push(...s), (u.preserve = s));
						},
						transformReply(u, t) {
							const i = new Set(t);
							let a = 0;
							const s = i.has(e.GEO_REPLY_WITH.DISTANCE) && ++a,
								o = i.has(e.GEO_REPLY_WITH.HASH) && ++a,
								f = i.has(e.GEO_REPLY_WITH.COORDINATES) && ++a;
							return u.map((d) => {
								const _ = d,
									c = { member: _[0] };
								if ((s && (c.distance = _[s]), o && (c.hash = _[o]), f)) {
									const [R, h] = _[f];
									c.coordinates = { longitude: R, latitude: h };
								}
								return c;
							});
						}
					}));
			})(Hr)),
		Hr
	);
}
var iO;
function $d() {
	if (iO) return J;
	iO = 1;
	var e =
			(J && J.__createBinding) ||
			(Object.create
				? function (s, o, f, d) {
						d === void 0 && (d = f);
						var _ = Object.getOwnPropertyDescriptor(o, f);
						((!_ || ('get' in _ ? !o.__esModule : _.writable || _.configurable)) &&
							(_ = {
								enumerable: !0,
								get: function () {
									return o[f];
								}
							}),
							Object.defineProperty(s, d, _));
					}
				: function (s, o, f, d) {
						(d === void 0 && (d = f), (s[d] = o[f]));
					}),
		r =
			(J && J.__setModuleDefault) ||
			(Object.create
				? function (s, o) {
						Object.defineProperty(s, 'default', { enumerable: !0, value: o });
					}
				: function (s, o) {
						s.default = o;
					}),
		n =
			(J && J.__importStar) ||
			function (s) {
				if (s && s.__esModule) return s;
				var o = {};
				if (s != null) for (var f in s) f !== 'default' && Object.prototype.hasOwnProperty.call(s, f) && e(o, s, f);
				return (r(o, s), o);
			},
		u =
			(J && J.__importDefault) ||
			function (s) {
				return s && s.__esModule ? s : { default: s };
			};
	(Object.defineProperty(J, '__esModule', { value: !0 }), (J.parseGeoRadiusWithArguments = void 0));
	const t = n(Pd()),
		i = u(vd());
	function a(s, o, f, d, _, c, R) {
		((0, t.parseGeoRadiusArguments)(s, o, f, d, _, R), s.pushVariadic(c), (s.preserve = c));
	}
	return (
		(J.parseGeoRadiusWithArguments = a),
		(J.default = {
			IS_READ_ONLY: t.default.IS_READ_ONLY,
			parseCommand(s, o, f, d, _, c, R) {
				(s.push('GEORADIUS'), a(s, o, f, d, _, c, R));
			},
			transformReply: i.default.transformReply
		}),
		J
	);
}
var sO;
function IP() {
	if (sO) return ht;
	sO = 1;
	var e =
		(ht && ht.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(ht, '__esModule', { value: !0 });
	const r = $d(),
		n = e($d());
	return (
		(ht.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(...u) {
				(u[0].push('GEORADIUS_RO'), (0, r.parseGeoRadiusWithArguments)(...u));
			},
			transformReply: n.default.transformReply
		}),
		ht
	);
}
var de = {},
	aO;
function LP() {
	if (aO) return de;
	aO = 1;
	var e =
			(de && de.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(de && de.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(de && de.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(de, '__esModule', { value: !0 });
	const u = n(Pd());
	return (
		(de.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(...t) {
				(t[0].push('GEORADIUS_RO'), (0, u.parseGeoRadiusArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		de
	);
}
var le = {},
	oO;
function MP() {
	if (oO) return le;
	oO = 1;
	var e =
			(le && le.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(le && le.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(le && le.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(le, '__esModule', { value: !0 });
	const u = n(Pd());
	return (
		(le.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(t, i, a, s, o, f, d) {
				(t.push('GEORADIUS'),
					(0, u.parseGeoRadiusArguments)(t, i, a, s, o, d),
					d?.STOREDIST ? (t.push('STOREDIST'), t.pushKey(f)) : (t.push('STORE'), t.pushKey(f)));
			},
			transformReply: void 0
		}),
		le
	);
}
var ce = {},
	Ve = {},
	mt = {},
	fO;
function bd() {
	if (fO) return mt;
	((fO = 1), Object.defineProperty(mt, '__esModule', { value: !0 }), (mt.parseGeoRadiusByMemberArguments = void 0));
	const e = Gr();
	function r(n, u, t, i, a, s) {
		(n.pushKey(u), n.push(t, i.toString(), a), (0, e.parseGeoSearchOptions)(n, s));
	}
	return (
		(mt.parseGeoRadiusByMemberArguments = r),
		(mt.default = {
			IS_READ_ONLY: !1,
			parseCommand(n, u, t, i, a, s) {
				(n.push('GEORADIUSBYMEMBER'), r(n, u, t, i, a, s));
			},
			transformReply: void 0
		}),
		mt
	);
}
var dO;
function HM() {
	if (dO) return Ve;
	dO = 1;
	var e =
		(Ve && Ve.__importDefault) ||
		function (i) {
			return i && i.__esModule ? i : { default: i };
		};
	(Object.defineProperty(Ve, '__esModule', { value: !0 }), (Ve.parseGeoRadiusByMemberWithArguments = void 0));
	const r = e(bd()),
		n = Gr(),
		u = e(vd());
	function t(i, a, s, o, f, d, _) {
		(i.pushKey(a), i.push(s, o.toString(), f), (0, n.parseGeoSearchOptions)(i, _), i.push(...d), (i.preserve = d));
	}
	return (
		(Ve.parseGeoRadiusByMemberWithArguments = t),
		(Ve.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(i, a, s, o, f, d, _) {
				(i.push('GEORADIUSBYMEMBER'), t(i, a, s, o, f, d, _));
			},
			transformReply: u.default.transformReply
		}),
		Ve
	);
}
var lO;
function DP() {
	if (lO) return ce;
	lO = 1;
	var e =
			(ce && ce.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(ce && ce.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(ce && ce.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(ce, '__esModule', { value: !0 });
	const u = n(HM());
	return (
		(ce.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(...t) {
				(t[0].push('GEORADIUSBYMEMBER_RO'), (0, u.parseGeoRadiusByMemberWithArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		ce
	);
}
var _e = {},
	cO;
function yP() {
	if (cO) return _e;
	cO = 1;
	var e =
			(_e && _e.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(_e && _e.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(_e && _e.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(_e, '__esModule', { value: !0 });
	const u = n(bd());
	return (
		(_e.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(...t) {
				(t[0].push('GEORADIUSBYMEMBER_RO'), (0, u.parseGeoRadiusByMemberArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		_e
	);
}
var Ee = {},
	_O;
function PP() {
	if (_O) return Ee;
	_O = 1;
	var e =
			(Ee && Ee.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Ee && Ee.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Ee && Ee.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Ee, '__esModule', { value: !0 });
	const u = n(bd());
	return (
		(Ee.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(t, i, a, s, o, f, d) {
				(t.push('GEORADIUSBYMEMBER'),
					(0, u.parseGeoRadiusByMemberArguments)(t, i, a, s, o, d),
					d?.STOREDIST ? (t.push('STOREDIST'), t.pushKey(f)) : (t.push('STORE'), t.pushKey(f)));
			},
			transformReply: void 0
		}),
		Ee
	);
}
var Pu = {},
	EO;
function vP() {
	if (EO) return Pu;
	((EO = 1), Object.defineProperty(Pu, '__esModule', { value: !0 }));
	const e = Gr();
	return (
		(Pu.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i, a) {
				(r.push('GEOSEARCHSTORE'), n !== void 0 && r.pushKey(n), (0, e.parseGeoSearchArguments)(r, u, t, i, a), a?.STOREDIST && r.push('STOREDIST'));
			},
			transformReply: void 0
		}),
		Pu
	);
}
var vu = {},
	RO;
function bP() {
	return (
		RO ||
			((RO = 1),
			Object.defineProperty(vu, '__esModule', { value: !0 }),
			(vu.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('GET'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		vu
	);
}
var bu = {},
	hO;
function gP() {
	return (
		hO ||
			((hO = 1),
			Object.defineProperty(bu, '__esModule', { value: !0 }),
			(bu.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('GETBIT'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		bu
	);
}
var gu = {},
	SO;
function UP() {
	return (
		SO ||
			((SO = 1),
			Object.defineProperty(gu, '__esModule', { value: !0 }),
			(gu.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('GETDEL'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		gu
	);
}
var Uu = {},
	mO;
function GP() {
	if (mO) return Uu;
	((mO = 1), Object.defineProperty(Uu, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Uu.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				if ((r.push('GETEX'), r.pushKey(n), 'type' in u))
					switch (u.type) {
						case 'EX':
						case 'PX':
							r.push(u.type, u.value.toString());
							break;
						case 'EXAT':
						case 'PXAT':
							r.push(u.type, (0, e.transformEXAT)(u.value));
							break;
						case 'PERSIST':
							r.push('PERSIST');
							break;
					}
				else
					'EX' in u
						? r.push('EX', u.EX.toString())
						: 'PX' in u
							? r.push('PX', u.PX.toString())
							: 'EXAT' in u
								? r.push('EXAT', (0, e.transformEXAT)(u.EXAT))
								: 'PXAT' in u
									? r.push('PXAT', (0, e.transformPXAT)(u.PXAT))
									: r.push('PERSIST');
			},
			transformReply: void 0
		}),
		Uu
	);
}
var Gu = {},
	OO;
function YP() {
	return (
		OO ||
			((OO = 1),
			Object.defineProperty(Gu, '__esModule', { value: !0 }),
			(Gu.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('GETRANGE'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		Gu
	);
}
var Yu = {},
	TO;
function BP() {
	return (
		TO ||
			((TO = 1),
			Object.defineProperty(Yu, '__esModule', { value: !0 }),
			(Yu.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('GETSET'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		Yu
	);
}
var Bu = {},
	AO;
function qP() {
	return (
		AO ||
			((AO = 1),
			Object.defineProperty(Bu, '__esModule', { value: !0 }),
			(Bu.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('EXISTS'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		Bu
	);
}
var qu = {},
	pO;
function HP() {
	return (
		pO ||
			((pO = 1),
			Object.defineProperty(qu, '__esModule', { value: !0 }),
			(qu.default = {
				parseCommand(e, r, n, u) {
					(e.push('EXPIRE'), e.pushKey(r), e.push(n.toString()), u && e.push(u));
				},
				transformReply: void 0
			})),
		qu
	);
}
var Hu = {},
	NO;
function jP() {
	if (NO) return Hu;
	((NO = 1), Object.defineProperty(Hu, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Hu.default = {
			parseCommand(r, n, u, t) {
				(r.push('EXPIREAT'), r.pushKey(n), r.push((0, e.transformEXAT)(u)), t && r.push(t));
			},
			transformReply: void 0
		}),
		Hu
	);
}
var ju = {},
	CO;
function FP() {
	return (
		CO ||
			((CO = 1),
			Object.defineProperty(ju, '__esModule', { value: !0 }),
			(ju.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('EXPIRETIME'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		ju
	);
}
var Ot = {},
	IO;
function KP() {
	return (
		IO ||
			((IO = 1),
			Object.defineProperty(Ot, '__esModule', { value: !0 }),
			(Ot.REDIS_FLUSH_MODES = void 0),
			(Ot.REDIS_FLUSH_MODES = { ASYNC: 'ASYNC', SYNC: 'SYNC' }),
			(Ot.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('FLUSHALL'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Ot
	);
}
var Fu = {},
	LO;
function wP() {
	return (
		LO ||
			((LO = 1),
			Object.defineProperty(Fu, '__esModule', { value: !0 }),
			(Fu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('FLUSHDB'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Fu
	);
}
var Re = {},
	MO;
function XP() {
	if (MO) return Re;
	MO = 1;
	var e =
			(Re && Re.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Re && Re.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Re && Re.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Re, '__esModule', { value: !0 });
	const u = n(Ur());
	return (
		(Re.default = {
			IS_READ_ONLY: !1,
			parseCommand(...t) {
				(t[0].push('FCALL'), (0, u.parseEvalArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		Re
	);
}
var he = {},
	DO;
function VP() {
	if (DO) return he;
	DO = 1;
	var e =
			(he && he.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(he && he.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(he && he.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(he, '__esModule', { value: !0 });
	const u = n(Ur());
	return (
		(he.default = {
			IS_READ_ONLY: !1,
			parseCommand(...t) {
				(t[0].push('FCALL_RO'), (0, u.parseEvalArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		he
	);
}
var Ku = {},
	yO;
function WP() {
	return (
		yO ||
			((yO = 1),
			Object.defineProperty(Ku, '__esModule', { value: !0 }),
			(Ku.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					e.push('FUNCTION', 'DELETE', r);
				},
				transformReply: void 0
			})),
		Ku
	);
}
var wu = {},
	PO;
function xP() {
	return (
		PO ||
			((PO = 1),
			Object.defineProperty(wu, '__esModule', { value: !0 }),
			(wu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('FUNCTION', 'DUMP');
				},
				transformReply: void 0
			})),
		wu
	);
}
var Xu = {},
	vO;
function ZP() {
	return (
		vO ||
			((vO = 1),
			Object.defineProperty(Xu, '__esModule', { value: !0 }),
			(Xu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('FUNCTION', 'FLUSH'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Xu
	);
}
var Vu = {},
	bO;
function JP() {
	return (
		bO ||
			((bO = 1),
			Object.defineProperty(Vu, '__esModule', { value: !0 }),
			(Vu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('FUNCTION', 'KILL');
				},
				transformReply: void 0
			})),
		Vu
	);
}
var Tt = {},
	Wu = {},
	gO;
function jM() {
	return (
		gO ||
			((gO = 1),
			Object.defineProperty(Wu, '__esModule', { value: !0 }),
			(Wu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('FUNCTION', 'LIST'), r?.LIBRARYNAME && e.push('LIBRARYNAME', r.LIBRARYNAME));
				},
				transformReply: {
					2: (e) =>
						e.map((r) => {
							const n = r;
							return {
								library_name: n[1],
								engine: n[3],
								functions: n[5].map((u) => {
									const t = u;
									return { name: t[1], description: t[3], flags: t[5] };
								})
							};
						}),
					3: void 0
				}
			})),
		Wu
	);
}
var UO;
function zP() {
	if (UO) return Tt;
	UO = 1;
	var e =
		(Tt && Tt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Tt, '__esModule', { value: !0 });
	const r = e(jM());
	return (
		(Tt.default = {
			NOT_KEYED_COMMAND: r.default.NOT_KEYED_COMMAND,
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				(r.default.parseCommand(...n), n[0].push('WITHCODE'));
			},
			transformReply: {
				2: (n) =>
					n.map((u) => {
						const t = u;
						return {
							library_name: t[1],
							engine: t[3],
							functions: t[5].map((i) => {
								const a = i;
								return { name: a[1], description: a[3], flags: a[5] };
							}),
							library_code: t[7]
						};
					}),
				3: void 0
			}
		}),
		Tt
	);
}
var xu = {},
	GO;
function QP() {
	return (
		GO ||
			((GO = 1),
			Object.defineProperty(xu, '__esModule', { value: !0 }),
			(xu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('FUNCTION', 'LOAD'), n?.REPLACE && e.push('REPLACE'), e.push(r));
				},
				transformReply: void 0
			})),
		xu
	);
}
var Zu = {},
	YO;
function kP() {
	return (
		YO ||
			((YO = 1),
			Object.defineProperty(Zu, '__esModule', { value: !0 }),
			(Zu.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('FUNCTION', 'RESTORE', r), n?.mode && e.push(n.mode));
				},
				transformReply: void 0
			})),
		Zu
	);
}
var Ju = {},
	BO;
function $P() {
	if (BO) return Ju;
	((BO = 1), Object.defineProperty(Ju, '__esModule', { value: !0 }));
	const e = L();
	Ju.default = {
		NOT_KEYED_COMMAND: !0,
		IS_READ_ONLY: !0,
		parseCommand(u) {
			u.push('FUNCTION', 'STATS');
		},
		transformReply: { 2: (u) => ({ running_script: r(u[1]), engines: n(u[3]) }), 3: void 0 }
	};
	function r(u) {
		if ((0, e.isNullReply)(u)) return null;
		const t = u;
		return { name: t[1], command: t[3], duration_ms: t[5] };
	}
	function n(u) {
		const t = u,
			i = Object.create(null);
		for (let a = 0; a < t.length; a++) {
			const s = t[a],
				o = t[++a],
				f = o;
			i[s.toString()] = { libraries_count: f[1], functions_count: f[3] };
		}
		return i;
	}
	return Ju;
}
var zu = {},
	qO;
function ev() {
	return (
		qO ||
			((qO = 1),
			Object.defineProperty(zu, '__esModule', { value: !0 }),
			(zu.default = {
				parseCommand(e, r, n) {
					(e.push('HDEL'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		zu
	);
}
var Qu = {},
	HO;
function FM() {
	return (
		HO ||
			((HO = 1),
			Object.defineProperty(Qu, '__esModule', { value: !0 }),
			(Qu.default = {
				parseCommand(e, r, n) {
					(e.push('HELLO'),
						r && (e.push(r.toString()), n?.AUTH && e.push('AUTH', n.AUTH.username, n.AUTH.password), n?.SETNAME && e.push('SETNAME', n.SETNAME)));
				},
				transformReply: { 2: (e) => ({ server: e[1], version: e[3], proto: e[5], id: e[7], mode: e[9], role: e[11], modules: e[13] }), 3: void 0 }
			})),
		Qu
	);
}
var ku = {},
	jO;
function tv() {
	return (
		jO ||
			((jO = 1),
			Object.defineProperty(ku, '__esModule', { value: !0 }),
			(ku.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HEXISTS'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		ku
	);
}
var At = {},
	FO;
function rv() {
	return (
		FO ||
			((FO = 1),
			Object.defineProperty(At, '__esModule', { value: !0 }),
			(At.HASH_EXPIRATION = void 0),
			(At.HASH_EXPIRATION = { FIELD_NOT_EXISTS: -2, CONDITION_NOT_MET: 0, UPDATED: 1, DELETED: 2 }),
			(At.default = {
				parseCommand(e, r, n, u, t) {
					(e.push('HEXPIRE'), e.pushKey(r), e.push(u.toString()), t && e.push(t), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		At
	);
}
var $u = {},
	KO;
function nv() {
	if (KO) return $u;
	((KO = 1), Object.defineProperty($u, '__esModule', { value: !0 }));
	const e = L();
	return (
		($u.default = {
			parseCommand(r, n, u, t, i) {
				(r.push('HEXPIREAT'), r.pushKey(n), r.push((0, e.transformEXAT)(t)), i && r.push(i), r.push('FIELDS'), r.pushVariadicWithLength(u));
			},
			transformReply: void 0
		}),
		$u
	);
}
var pt = {},
	wO;
function uv() {
	return (
		wO ||
			((wO = 1),
			Object.defineProperty(pt, '__esModule', { value: !0 }),
			(pt.HASH_EXPIRATION_TIME = void 0),
			(pt.HASH_EXPIRATION_TIME = { FIELD_NOT_EXISTS: -2, NO_EXPIRATION: -1 }),
			(pt.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HEXPIRETIME'), e.pushKey(r), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		pt
	);
}
var ei = {},
	XO;
function iv() {
	return (
		XO ||
			((XO = 1),
			Object.defineProperty(ei, '__esModule', { value: !0 }),
			(ei.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HGET'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		ei
	);
}
var ti = {},
	VO;
function sv() {
	if (VO) return ti;
	((VO = 1), Object.defineProperty(ti, '__esModule', { value: !0 }));
	const e = L();
	return (
		(ti.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('HGETALL'), r.pushKey(n));
			},
			TRANSFORM_LEGACY_REPLY: !0,
			transformReply: { 2: e.transformTuplesReply, 3: void 0 }
		}),
		ti
	);
}
var ri = {},
	WO;
function av() {
	return (
		WO ||
			((WO = 1),
			Object.defineProperty(ri, '__esModule', { value: !0 }),
			(ri.default = {
				parseCommand(e, r, n) {
					(e.push('HGETDEL'), e.pushKey(r), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		ri
	);
}
var ni = {},
	xO;
function ov() {
	return (
		xO ||
			((xO = 1),
			Object.defineProperty(ni, '__esModule', { value: !0 }),
			(ni.default = {
				parseCommand(e, r, n, u) {
					(e.push('HGETEX'),
						e.pushKey(r),
						u?.expiration &&
							(typeof u.expiration == 'string'
								? e.push(u.expiration)
								: u.expiration.type === 'PERSIST'
									? e.push('PERSIST')
									: e.push(u.expiration.type, u.expiration.value.toString())),
						e.push('FIELDS'),
						e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		ni
	);
}
var ui = {},
	ZO;
function fv() {
	return (
		ZO ||
			((ZO = 1),
			Object.defineProperty(ui, '__esModule', { value: !0 }),
			(ui.default = {
				parseCommand(e, r, n, u) {
					(e.push('HINCRBY'), e.pushKey(r), e.push(n, u.toString()));
				},
				transformReply: void 0
			})),
		ui
	);
}
var ii = {},
	JO;
function dv() {
	return (
		JO ||
			((JO = 1),
			Object.defineProperty(ii, '__esModule', { value: !0 }),
			(ii.default = {
				parseCommand(e, r, n, u) {
					(e.push('HINCRBYFLOAT'), e.pushKey(r), e.push(n, u.toString()));
				},
				transformReply: void 0
			})),
		ii
	);
}
var si = {},
	zO;
function lv() {
	return (
		zO ||
			((zO = 1),
			Object.defineProperty(si, '__esModule', { value: !0 }),
			(si.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('HKEYS'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		si
	);
}
var ai = {},
	QO;
function cv() {
	return (
		QO ||
			((QO = 1),
			Object.defineProperty(ai, '__esModule', { value: !0 }),
			(ai.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('HLEN'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		ai
	);
}
var oi = {},
	kO;
function _v() {
	return (
		kO ||
			((kO = 1),
			Object.defineProperty(oi, '__esModule', { value: !0 }),
			(oi.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HMGET'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		oi
	);
}
var fi = {},
	$O;
function Ev() {
	return (
		$O ||
			(($O = 1),
			Object.defineProperty(fi, '__esModule', { value: !0 }),
			(fi.default = {
				parseCommand(e, r, n) {
					(e.push('HPERSIST'), e.pushKey(r), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		fi
	);
}
var di = {},
	eT;
function Rv() {
	return (
		eT ||
			((eT = 1),
			Object.defineProperty(di, '__esModule', { value: !0 }),
			(di.default = {
				parseCommand(e, r, n, u, t) {
					(e.push('HPEXPIRE'), e.pushKey(r), e.push(u.toString()), t && e.push(t), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		di
	);
}
var li = {},
	tT;
function hv() {
	if (tT) return li;
	((tT = 1), Object.defineProperty(li, '__esModule', { value: !0 }));
	const e = L();
	return (
		(li.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t, i) {
				(r.push('HPEXPIREAT'), r.pushKey(n), r.push((0, e.transformPXAT)(t)), i && r.push(i), r.push('FIELDS'), r.pushVariadicWithLength(u));
			},
			transformReply: void 0
		}),
		li
	);
}
var ci = {},
	rT;
function Sv() {
	return (
		rT ||
			((rT = 1),
			Object.defineProperty(ci, '__esModule', { value: !0 }),
			(ci.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HPEXPIRETIME'), e.pushKey(r), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		ci
	);
}
var _i = {},
	nT;
function mv() {
	return (
		nT ||
			((nT = 1),
			Object.defineProperty(_i, '__esModule', { value: !0 }),
			(_i.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HPTTL'), e.pushKey(r), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		_i
	);
}
var Ei = {},
	uT;
function Ov() {
	return (
		uT ||
			((uT = 1),
			Object.defineProperty(Ei, '__esModule', { value: !0 }),
			(Ei.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HRANDFIELD'), e.pushKey(r), e.push(n.toString(), 'WITHVALUES'));
				},
				transformReply: {
					2: (e) => {
						const r = [];
						let n = 0;
						for (; n < e.length; ) r.push({ field: e[n++], value: e[n++] });
						return r;
					},
					3: (e) =>
						e.map((r) => {
							const [n, u] = r;
							return { field: n, value: u };
						})
				}
			})),
		Ei
	);
}
var Ri = {},
	iT;
function Tv() {
	return (
		iT ||
			((iT = 1),
			Object.defineProperty(Ri, '__esModule', { value: !0 }),
			(Ri.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HRANDFIELD'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		Ri
	);
}
var hi = {},
	sT;
function Av() {
	return (
		sT ||
			((sT = 1),
			Object.defineProperty(hi, '__esModule', { value: !0 }),
			(hi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('HRANDFIELD'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		hi
	);
}
var Si = {},
	We = {},
	aT;
function gd() {
	if (aT) return We;
	((aT = 1), Object.defineProperty(We, '__esModule', { value: !0 }), (We.pushScanArguments = We.parseScanArguments = void 0));
	function e(n, u, t) {
		(n.push(u), t?.MATCH && n.push('MATCH', t.MATCH), t?.COUNT && n.push('COUNT', t.COUNT.toString()));
	}
	We.parseScanArguments = e;
	function r(n, u, t) {
		return (n.push(u.toString()), t?.MATCH && n.push('MATCH', t.MATCH), t?.COUNT && n.push('COUNT', t.COUNT.toString()), n);
	}
	return (
		(We.pushScanArguments = r),
		(We.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(n, u, t) {
				(n.push('SCAN'), e(n, u, t), t?.TYPE && n.push('TYPE', t.TYPE));
			},
			transformReply([n, u]) {
				return { cursor: n, keys: u };
			}
		}),
		We
	);
}
var oT;
function KM() {
	if (oT) return Si;
	((oT = 1), Object.defineProperty(Si, '__esModule', { value: !0 }));
	const e = gd();
	return (
		(Si.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				(r.push('HSCAN'), r.pushKey(n), (0, e.parseScanArguments)(r, u, t));
			},
			transformReply([r, n]) {
				const u = [];
				let t = 0;
				for (; t < n.length; ) u.push({ field: n[t++], value: n[t++] });
				return { cursor: r, entries: u };
			}
		}),
		Si
	);
}
var Nt = {},
	fT;
function pv() {
	if (fT) return Nt;
	fT = 1;
	var e =
		(Nt && Nt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Nt, '__esModule', { value: !0 });
	const r = e(KM());
	return (
		(Nt.default = {
			IS_READ_ONLY: !0,
			parseCommand(...n) {
				const u = n[0];
				(r.default.parseCommand(...n), u.push('NOVALUES'));
			},
			transformReply([n, u]) {
				return { cursor: n, fields: u };
			}
		}),
		Nt
	);
}
var mi = {},
	dT;
function Nv() {
	if (dT) return mi;
	((dT = 1),
		Object.defineProperty(mi, '__esModule', { value: !0 }),
		(mi.default = {
			parseCommand(t, ...[i, a, s]) {
				(t.push('HSET'),
					t.pushKey(i),
					typeof a == 'string' || typeof a == 'number' || a instanceof Buffer
						? t.push(u(a), u(s))
						: a instanceof Map
							? e(t, a)
							: Array.isArray(a)
								? r(t, a)
								: n(t, a));
			},
			transformReply: void 0
		}));
	function e(t, i) {
		for (const [a, s] of i.entries()) t.push(u(a), u(s));
	}
	function r(t, i) {
		for (const a of i) {
			if (Array.isArray(a)) {
				r(t, a);
				continue;
			}
			t.push(u(a));
		}
	}
	function n(t, i) {
		for (const a of Object.keys(i)) t.push(u(a), u(i[a]));
	}
	function u(t) {
		return typeof t == 'number' ? t.toString() : t;
	}
	return mi;
}
var Oi = {},
	lT;
function Cv() {
	if (lT) return Oi;
	((lT = 1), Object.defineProperty(Oi, '__esModule', { value: !0 }));
	const e = He();
	Oi.default = {
		parseCommand(a, s, o, f) {
			(a.push('HSETEX'),
				a.pushKey(s),
				f?.mode && a.push(f.mode),
				f?.expiration &&
					(typeof f.expiration == 'string'
						? a.push(f.expiration)
						: f.expiration.type === 'KEEPTTL'
							? a.push('KEEPTTL')
							: a.push(f.expiration.type, f.expiration.value.toString())),
				a.push('FIELDS'),
				o instanceof Map ? r(a, o) : Array.isArray(o) ? n(a, o) : t(a, o));
		},
		transformReply: void 0
	};
	function r(a, s) {
		a.push(s.size.toString());
		for (const [o, f] of s.entries()) a.push(i(o), i(f));
	}
	function n(a, s) {
		const o = new e.BasicCommandParser();
		if ((u(o, s), o.redisArgs.length % 2 != 0))
			throw Error('invalid number of arguments, expected key value ....[key value] pairs, got key without value');
		(a.push((o.redisArgs.length / 2).toString()), a.push(...o.redisArgs));
	}
	function u(a, s) {
		for (const o of s) {
			if (Array.isArray(o)) {
				u(a, o);
				continue;
			}
			a.push(i(o));
		}
	}
	function t(a, s) {
		const o = Object.keys(s).length;
		if (o == 0) throw Error('object without keys');
		a.push(o.toString());
		for (const f of Object.keys(s)) a.push(i(f), i(s[f]));
	}
	function i(a) {
		return typeof a == 'number' ? a.toString() : a;
	}
	return Oi;
}
var Ti = {},
	cT;
function Iv() {
	return (
		cT ||
			((cT = 1),
			Object.defineProperty(Ti, '__esModule', { value: !0 }),
			(Ti.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('HSETNX'), e.pushKey(r), e.push(n, u));
				},
				transformReply: void 0
			})),
		Ti
	);
}
var Ai = {},
	_T;
function Lv() {
	return (
		_T ||
			((_T = 1),
			Object.defineProperty(Ai, '__esModule', { value: !0 }),
			(Ai.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HSTRLEN'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		Ai
	);
}
var pi = {},
	ET;
function Mv() {
	return (
		ET ||
			((ET = 1),
			Object.defineProperty(pi, '__esModule', { value: !0 }),
			(pi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('HTTL'), e.pushKey(r), e.push('FIELDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		pi
	);
}
var Ni = {},
	RT;
function Dv() {
	return (
		RT ||
			((RT = 1),
			Object.defineProperty(Ni, '__esModule', { value: !0 }),
			(Ni.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('HVALS'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Ni
	);
}
var Ci = {},
	hT;
function yv() {
	return (
		hT ||
			((hT = 1),
			Object.defineProperty(Ci, '__esModule', { value: !0 }),
			(Ci.default = {
				parseCommand(e, r) {
					(e.push('INCR'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Ci
	);
}
var Ii = {},
	ST;
function Pv() {
	return (
		ST ||
			((ST = 1),
			Object.defineProperty(Ii, '__esModule', { value: !0 }),
			(Ii.default = {
				parseCommand(e, r, n) {
					(e.push('INCRBY'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		Ii
	);
}
var Li = {},
	mT;
function vv() {
	return (
		mT ||
			((mT = 1),
			Object.defineProperty(Li, '__esModule', { value: !0 }),
			(Li.default = {
				parseCommand(e, r, n) {
					(e.push('INCRBYFLOAT'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		Li
	);
}
var Mi = {},
	OT;
function bv() {
	return (
		OT ||
			((OT = 1),
			Object.defineProperty(Mi, '__esModule', { value: !0 }),
			(Mi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('INFO'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Mi
	);
}
var Di = {},
	TT;
function gv() {
	return (
		TT ||
			((TT = 1),
			Object.defineProperty(Di, '__esModule', { value: !0 }),
			(Di.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('KEYS', r);
				},
				transformReply: void 0
			})),
		Di
	);
}
var yi = {},
	AT;
function Uv() {
	return (
		AT ||
			((AT = 1),
			Object.defineProperty(yi, '__esModule', { value: !0 }),
			(yi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('LASTSAVE');
				},
				transformReply: void 0
			})),
		yi
	);
}
var Pi = {},
	pT;
function Gv() {
	return (
		pT ||
			((pT = 1),
			Object.defineProperty(Pi, '__esModule', { value: !0 }),
			(Pi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('LATENCY', 'DOCTOR');
				},
				transformReply: void 0
			})),
		Pi
	);
}
var Ct = {},
	NT;
function wM() {
	return (
		NT ||
			((NT = 1),
			Object.defineProperty(Ct, '__esModule', { value: !0 }),
			(Ct.LATENCY_EVENTS = void 0),
			(Ct.LATENCY_EVENTS = {
				ACTIVE_DEFRAG_CYCLE: 'active-defrag-cycle',
				AOF_FSYNC_ALWAYS: 'aof-fsync-always',
				AOF_STAT: 'aof-stat',
				AOF_REWRITE_DIFF_WRITE: 'aof-rewrite-diff-write',
				AOF_RENAME: 'aof-rename',
				AOF_WRITE: 'aof-write',
				AOF_WRITE_ACTIVE_CHILD: 'aof-write-active-child',
				AOF_WRITE_ALONE: 'aof-write-alone',
				AOF_WRITE_PENDING_FSYNC: 'aof-write-pending-fsync',
				COMMAND: 'command',
				EXPIRE_CYCLE: 'expire-cycle',
				EVICTION_CYCLE: 'eviction-cycle',
				EVICTION_DEL: 'eviction-del',
				FAST_COMMAND: 'fast-command',
				FORK: 'fork',
				RDB_UNLINK_TEMP_FILE: 'rdb-unlink-temp-file'
			}),
			(Ct.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('LATENCY', 'GRAPH', r);
				},
				transformReply: void 0
			})),
		Ct
	);
}
var vi = {},
	CT;
function Yv() {
	return (
		CT ||
			((CT = 1),
			Object.defineProperty(vi, '__esModule', { value: !0 }),
			(vi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('LATENCY', 'HISTORY', r);
				},
				transformReply: void 0
			})),
		vi
	);
}
var bi = {},
	IT;
function Bv() {
	return (
		IT ||
			((IT = 1),
			Object.defineProperty(bi, '__esModule', { value: !0 }),
			(bi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('LATENCY', 'LATEST');
				},
				transformReply: void 0
			})),
		bi
	);
}
var Wd = {},
	LT;
function qv() {
	return (
		LT ||
			((LT = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.LATENCY_EVENTS = void 0));
				const r = wM();
				(Object.defineProperty(e, 'LATENCY_EVENTS', {
					enumerable: !0,
					get: function () {
						return r.LATENCY_EVENTS;
					}
				}),
					(e.default = {
						NOT_KEYED_COMMAND: !0,
						IS_READ_ONLY: !1,
						parseCommand(n, ...u) {
							const t = ['LATENCY', 'RESET'];
							(u.length > 0 && t.push(...u), n.push(...t));
						},
						transformReply: void 0
					}));
			})(Wd)),
		Wd
	);
}
var It = {},
	Lt = {},
	gi = {},
	MT;
function rl() {
	return (
		MT ||
			((MT = 1),
			Object.defineProperty(gi, '__esModule', { value: !0 }),
			(gi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('LCS'), e.pushKeys([r, n]));
				},
				transformReply: void 0
			})),
		gi
	);
}
var DT;
function XM() {
	if (DT) return Lt;
	DT = 1;
	var e =
		(Lt && Lt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Lt, '__esModule', { value: !0 });
	const r = e(rl());
	return (
		(Lt.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u, t, i) {
				(r.default.parseCommand(n, u, t), n.push('IDX'), i?.MINMATCHLEN && n.push('MINMATCHLEN', i.MINMATCHLEN.toString()));
			},
			transformReply: { 2: (n) => ({ matches: n[1], len: n[3] }), 3: void 0 }
		}),
		Lt
	);
}
var yT;
function Hv() {
	if (yT) return It;
	yT = 1;
	var e =
		(It && It.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(It, '__esModule', { value: !0 });
	const r = e(XM());
	return (
		(It.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				const u = n[0];
				(r.default.parseCommand(...n), u.push('WITHMATCHLEN'));
			},
			transformReply: { 2: (n) => ({ matches: n[1], len: n[3] }), 3: void 0 }
		}),
		It
	);
}
var Mt = {},
	PT;
function jv() {
	if (PT) return Mt;
	PT = 1;
	var e =
		(Mt && Mt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Mt, '__esModule', { value: !0 });
	const r = e(rl());
	return (
		(Mt.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				const u = n[0];
				(r.default.parseCommand(...n), u.push('LEN'));
			},
			transformReply: void 0
		}),
		Mt
	);
}
var Ui = {},
	vT;
function Fv() {
	return (
		vT ||
			((vT = 1),
			Object.defineProperty(Ui, '__esModule', { value: !0 }),
			(Ui.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('LINDEX'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		Ui
	);
}
var Gi = {},
	bT;
function Kv() {
	return (
		bT ||
			((bT = 1),
			Object.defineProperty(Gi, '__esModule', { value: !0 }),
			(Gi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t) {
					(e.push('LINSERT'), e.pushKey(r), e.push(n, u, t));
				},
				transformReply: void 0
			})),
		Gi
	);
}
var Yi = {},
	gT;
function wv() {
	return (
		gT ||
			((gT = 1),
			Object.defineProperty(Yi, '__esModule', { value: !0 }),
			(Yi.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('LLEN'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Yi
	);
}
var Bi = {},
	UT;
function Xv() {
	return (
		UT ||
			((UT = 1),
			Object.defineProperty(Bi, '__esModule', { value: !0 }),
			(Bi.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('LMOVE'), e.pushKeys([r, n]), e.push(u, t));
				},
				transformReply: void 0
			})),
		Bi
	);
}
var qi = {},
	GT;
function Vv() {
	return (
		GT ||
			((GT = 1),
			Object.defineProperty(qi, '__esModule', { value: !0 }),
			(qi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, ...n) {
					(e.push('LOLWUT'), r && (e.push('VERSION', r.toString()), e.pushVariadic(n.map(String))));
				},
				transformReply: void 0
			})),
		qi
	);
}
var Dt = {},
	Hi = {},
	YT;
function VM() {
	return (
		YT ||
			((YT = 1),
			Object.defineProperty(Hi, '__esModule', { value: !0 }),
			(Hi.default = {
				parseCommand(e, r) {
					(e.push('LPOP'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Hi
	);
}
var BT;
function Wv() {
	if (BT) return Dt;
	BT = 1;
	var e =
		(Dt && Dt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Dt, '__esModule', { value: !0 });
	const r = e(VM());
	return (
		(Dt.default = {
			IS_READ_ONLY: !1,
			parseCommand(n, u, t) {
				(r.default.parseCommand(n, u), n.push(t.toString()));
			},
			transformReply: void 0
		}),
		Dt
	);
}
var yt = {},
	ji = {},
	qT;
function WM() {
	return (
		qT ||
			((qT = 1),
			Object.defineProperty(ji, '__esModule', { value: !0 }),
			(ji.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('LPOS'),
						e.pushKey(r),
						e.push(n),
						u?.RANK !== void 0 && e.push('RANK', u.RANK.toString()),
						u?.MAXLEN !== void 0 && e.push('MAXLEN', u.MAXLEN.toString()));
				},
				transformReply: void 0
			})),
		ji
	);
}
var HT;
function xv() {
	if (HT) return yt;
	HT = 1;
	var e =
		(yt && yt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(yt, '__esModule', { value: !0 });
	const r = e(WM());
	return (
		(yt.default = {
			CACHEABLE: r.default.CACHEABLE,
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u, t, i, a) {
				(r.default.parseCommand(n, u, t, a), n.push('COUNT', i.toString()));
			},
			transformReply: void 0
		}),
		yt
	);
}
var Fi = {},
	jT;
function Zv() {
	return (
		jT ||
			((jT = 1),
			Object.defineProperty(Fi, '__esModule', { value: !0 }),
			(Fi.default = {
				parseCommand(e, r, n) {
					(e.push('LPUSH'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Fi
	);
}
var Ki = {},
	FT;
function Jv() {
	return (
		FT ||
			((FT = 1),
			Object.defineProperty(Ki, '__esModule', { value: !0 }),
			(Ki.default = {
				parseCommand(e, r, n) {
					(e.push('LPUSHX'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Ki
	);
}
var wi = {},
	KT;
function zv() {
	return (
		KT ||
			((KT = 1),
			Object.defineProperty(wi, '__esModule', { value: !0 }),
			(wi.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('LRANGE'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		wi
	);
}
var Xi = {},
	wT;
function Qv() {
	return (
		wT ||
			((wT = 1),
			Object.defineProperty(Xi, '__esModule', { value: !0 }),
			(Xi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('LREM'), e.pushKey(r), e.push(n.toString()), e.push(u));
				},
				transformReply: void 0
			})),
		Xi
	);
}
var Vi = {},
	XT;
function kv() {
	return (
		XT ||
			((XT = 1),
			Object.defineProperty(Vi, '__esModule', { value: !0 }),
			(Vi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('LSET'), e.pushKey(r), e.push(n.toString(), u));
				},
				transformReply: void 0
			})),
		Vi
	);
}
var Wi = {},
	VT;
function $v() {
	return (
		VT ||
			((VT = 1),
			Object.defineProperty(Wi, '__esModule', { value: !0 }),
			(Wi.default = {
				parseCommand(e, r, n, u) {
					(e.push('LTRIM'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		Wi
	);
}
var xi = {},
	WT;
function eb() {
	return (
		WT ||
			((WT = 1),
			Object.defineProperty(xi, '__esModule', { value: !0 }),
			(xi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('MEMORY', 'DOCTOR');
				},
				transformReply: void 0
			})),
		xi
	);
}
var Zi = {},
	xT;
function tb() {
	return (
		xT ||
			((xT = 1),
			Object.defineProperty(Zi, '__esModule', { value: !0 }),
			(Zi.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('MEMORY', 'MALLOC-STATS');
				},
				transformReply: void 0
			})),
		Zi
	);
}
var Ji = {},
	ZT;
function rb() {
	return (
		ZT ||
			((ZT = 1),
			Object.defineProperty(Ji, '__esModule', { value: !0 }),
			(Ji.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e) {
					e.push('MEMORY', 'PURGE');
				},
				transformReply: void 0
			})),
		Ji
	);
}
var zi = {},
	JT;
function nb() {
	if (JT) return zi;
	((JT = 1), Object.defineProperty(zi, '__esModule', { value: !0 }));
	const e = L();
	return (
		(zi.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r) {
				r.push('MEMORY', 'STATS');
			},
			transformReply: {
				2: (r, n, u) => {
					const t = {};
					let i = 0;
					for (; i < r.length; )
						switch (r[i].toString()) {
							case 'dataset.percentage':
							case 'peak.percentage':
							case 'allocator-fragmentation.ratio':
							case 'allocator-rss.ratio':
							case 'rss-overhead.ratio':
							case 'fragmentation':
								t[r[i++]] = e.transformDoubleReply[2](r[i++], n, u);
								break;
							default:
								t[r[i++]] = r[i++];
						}
					return t;
				},
				3: void 0
			}
		}),
		zi
	);
}
var Qi = {},
	zT;
function ub() {
	return (
		zT ||
			((zT = 1),
			Object.defineProperty(Qi, '__esModule', { value: !0 }),
			(Qi.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('MEMORY', 'USAGE'), e.pushKey(r), n?.SAMPLES && e.push('SAMPLES', n.SAMPLES.toString()));
				},
				transformReply: void 0
			})),
		Qi
	);
}
var ki = {},
	QT;
function ib() {
	return (
		QT ||
			((QT = 1),
			Object.defineProperty(ki, '__esModule', { value: !0 }),
			(ki.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('MGET'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		ki
	);
}
var $i = {},
	kT;
function sb() {
	return (
		kT ||
			((kT = 1),
			Object.defineProperty($i, '__esModule', { value: !0 }),
			($i.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t, i, a) {
					e.push('MIGRATE', r, n.toString());
					const s = Array.isArray(u);
					(s ? e.push('') : e.push(u),
						e.push(t.toString(), i.toString()),
						a?.COPY && e.push('COPY'),
						a?.REPLACE && e.push('REPLACE'),
						a?.AUTH && (a.AUTH.username ? e.push('AUTH2', a.AUTH.username, a.AUTH.password) : e.push('AUTH', a.AUTH.password)),
						s && (e.push('KEYS'), e.pushVariadic(u)));
				},
				transformReply: void 0
			})),
		$i
	);
}
var es = {},
	$T;
function ab() {
	return (
		$T ||
			(($T = 1),
			Object.defineProperty(es, '__esModule', { value: !0 }),
			(es.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('MODULE', 'LIST');
				},
				transformReply: {
					2: (e) =>
						e.map((r) => {
							const n = r;
							return { name: n[1], ver: n[3] };
						}),
					3: void 0
				}
			})),
		es
	);
}
var ts = {},
	eA;
function ob() {
	return (
		eA ||
			((eA = 1),
			Object.defineProperty(ts, '__esModule', { value: !0 }),
			(ts.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('MODULE', 'LOAD', r), n && e.push(...n));
				},
				transformReply: void 0
			})),
		ts
	);
}
var rs = {},
	tA;
function fb() {
	return (
		tA ||
			((tA = 1),
			Object.defineProperty(rs, '__esModule', { value: !0 }),
			(rs.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('MODULE', 'UNLOAD', r);
				},
				transformReply: void 0
			})),
		rs
	);
}
var ns = {},
	rA;
function db() {
	return (
		rA ||
			((rA = 1),
			Object.defineProperty(ns, '__esModule', { value: !0 }),
			(ns.default = {
				parseCommand(e, r, n) {
					(e.push('MOVE'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		ns
	);
}
var Pt = {},
	nA;
function xM() {
	if (nA) return Pt;
	((nA = 1), Object.defineProperty(Pt, '__esModule', { value: !0 }), (Pt.parseMSetArguments = void 0));
	function e(r, n) {
		if (Array.isArray(n)) {
			if (n.length == 0) throw new Error('empty toSet Argument');
			if (Array.isArray(n[0])) for (const u of n) (r.pushKey(u[0]), r.push(u[1]));
			else {
				const u = n;
				for (let t = 0; t < u.length; t += 2) (r.pushKey(u[t]), r.push(u[t + 1]));
			}
		} else for (const u of Object.entries(n)) (r.pushKey(u[0]), r.push(u[1]));
	}
	return (
		(Pt.parseMSetArguments = e),
		(Pt.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				return (r.push('MSET'), e(r, n));
			},
			transformReply: void 0
		}),
		Pt
	);
}
var xd = {},
	uA;
function lb() {
	return (
		uA ||
			((uA = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.parseMSetExArguments = e.ExpirationMode = e.SetMode = void 0));
				const r = L();
				((e.SetMode = { XX: 'XX', NX: 'NX' }), (e.ExpirationMode = { EX: 'EX', PX: 'PX', EXAT: 'EXAT', PXAT: 'PXAT', KEEPTTL: 'KEEPTTL' }));
				function n(u, t) {
					let i = [];
					if (Array.isArray(t)) {
						if (t.length == 0) throw new Error('empty keyValuePairs Argument');
						if (Array.isArray(t[0])) i = t;
						else {
							const a = t;
							for (let s = 0; s < a.length; s += 2) i.push([a[s], a[s + 1]]);
						}
					} else for (const a of Object.entries(t)) i.push([a[0], a[1]]);
					u.push(i.length.toString());
					for (const a of i) (u.pushKey(a[0]), u.push(a[1]));
				}
				((e.parseMSetExArguments = n),
					(e.default = {
						parseCommand(u, t, i) {
							if ((u.push('MSETEX'), n(u, t), i?.mode && u.push(i.mode), i?.expiration))
								switch (i.expiration.type) {
									case e.ExpirationMode.EXAT:
										u.push(e.ExpirationMode.EXAT, (0, r.transformEXAT)(i.expiration.value));
										break;
									case e.ExpirationMode.PXAT:
										u.push(e.ExpirationMode.PXAT, (0, r.transformPXAT)(i.expiration.value));
										break;
									case e.ExpirationMode.KEEPTTL:
										u.push(e.ExpirationMode.KEEPTTL);
										break;
									case e.ExpirationMode.EX:
									case e.ExpirationMode.PX:
										u.push(i.expiration.type, i.expiration.value?.toString());
										break;
								}
						},
						transformReply: void 0
					}));
			})(xd)),
		xd
	);
}
var us = {},
	iA;
function cb() {
	if (iA) return us;
	((iA = 1), Object.defineProperty(us, '__esModule', { value: !0 }));
	const e = xM();
	return (
		(us.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				return (r.push('MSETNX'), (0, e.parseMSetArguments)(r, n));
			},
			transformReply: void 0
		}),
		us
	);
}
var is = {},
	sA;
function _b() {
	return (
		sA ||
			((sA = 1),
			Object.defineProperty(is, '__esModule', { value: !0 }),
			(is.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('OBJECT', 'ENCODING'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		is
	);
}
var ss = {},
	aA;
function Eb() {
	return (
		aA ||
			((aA = 1),
			Object.defineProperty(ss, '__esModule', { value: !0 }),
			(ss.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('OBJECT', 'FREQ'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		ss
	);
}
var as = {},
	oA;
function Rb() {
	return (
		oA ||
			((oA = 1),
			Object.defineProperty(as, '__esModule', { value: !0 }),
			(as.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('OBJECT', 'IDLETIME'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		as
	);
}
var os = {},
	fA;
function hb() {
	return (
		fA ||
			((fA = 1),
			Object.defineProperty(os, '__esModule', { value: !0 }),
			(os.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('OBJECT', 'REFCOUNT'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		os
	);
}
var fs = {},
	dA;
function Sb() {
	return (
		dA ||
			((dA = 1),
			Object.defineProperty(fs, '__esModule', { value: !0 }),
			(fs.default = {
				parseCommand(e, r) {
					(e.push('PERSIST'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		fs
	);
}
var ds = {},
	lA;
function mb() {
	return (
		lA ||
			((lA = 1),
			Object.defineProperty(ds, '__esModule', { value: !0 }),
			(ds.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('PEXPIRE'), e.pushKey(r), e.push(n.toString()), u && e.push(u));
				},
				transformReply: void 0
			})),
		ds
	);
}
var ls = {},
	cA;
function Ob() {
	if (cA) return ls;
	((cA = 1), Object.defineProperty(ls, '__esModule', { value: !0 }));
	const e = L();
	return (
		(ls.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				(r.push('PEXPIREAT'), r.pushKey(n), r.push((0, e.transformPXAT)(u)), t && r.push(t));
			},
			transformReply: void 0
		}),
		ls
	);
}
var cs = {},
	_A;
function Tb() {
	return (
		_A ||
			((_A = 1),
			Object.defineProperty(cs, '__esModule', { value: !0 }),
			(cs.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PEXPIRETIME'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		cs
	);
}
var _s = {},
	EA;
function Ab() {
	return (
		EA ||
			((EA = 1),
			Object.defineProperty(_s, '__esModule', { value: !0 }),
			(_s.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('PFADD'), e.pushKey(r), n && e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		_s
	);
}
var Es = {},
	RA;
function pb() {
	return (
		RA ||
			((RA = 1),
			Object.defineProperty(Es, '__esModule', { value: !0 }),
			(Es.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PFCOUNT'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		Es
	);
}
var Rs = {},
	hA;
function Nb() {
	return (
		hA ||
			((hA = 1),
			Object.defineProperty(Rs, '__esModule', { value: !0 }),
			(Rs.default = {
				parseCommand(e, r, n) {
					(e.push('PFMERGE'), e.pushKey(r), n && e.pushKeys(n));
				},
				transformReply: void 0
			})),
		Rs
	);
}
var hs = {},
	SA;
function Cb() {
	return (
		SA ||
			((SA = 1),
			Object.defineProperty(hs, '__esModule', { value: !0 }),
			(hs.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PING'), r && e.push(r));
				},
				transformReply: void 0
			})),
		hs
	);
}
var Ss = {},
	mA;
function Ib() {
	return (
		mA ||
			((mA = 1),
			Object.defineProperty(Ss, '__esModule', { value: !0 }),
			(Ss.default = {
				parseCommand(e, r, n, u) {
					(e.push('PSETEX'), e.pushKey(r), e.push(n.toString(), u));
				},
				transformReply: void 0
			})),
		Ss
	);
}
var ms = {},
	OA;
function Lb() {
	return (
		OA ||
			((OA = 1),
			Object.defineProperty(ms, '__esModule', { value: !0 }),
			(ms.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PTTL'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		ms
	);
}
var Os = {},
	TA;
function Mb() {
	return (
		TA ||
			((TA = 1),
			Object.defineProperty(Os, '__esModule', { value: !0 }),
			(Os.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				IS_FORWARD_COMMAND: !0,
				parseCommand(e, r, n) {
					e.push('PUBLISH', r, n);
				},
				transformReply: void 0
			})),
		Os
	);
}
var Ts = {},
	AA;
function Db() {
	return (
		AA ||
			((AA = 1),
			Object.defineProperty(Ts, '__esModule', { value: !0 }),
			(Ts.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PUBSUB', 'CHANNELS'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Ts
	);
}
var As = {},
	pA;
function yb() {
	return (
		pA ||
			((pA = 1),
			Object.defineProperty(As, '__esModule', { value: !0 }),
			(As.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('PUBSUB', 'NUMPAT');
				},
				transformReply: void 0
			})),
		As
	);
}
var ps = {},
	NA;
function Pb() {
	return (
		NA ||
			((NA = 1),
			Object.defineProperty(ps, '__esModule', { value: !0 }),
			(ps.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PUBSUB', 'NUMSUB'), r && e.pushVariadic(r));
				},
				transformReply(e) {
					const r = Object.create(null);
					let n = 0;
					for (; n < e.length; ) r[e[n++].toString()] = Number(e[n++]);
					return r;
				}
			})),
		ps
	);
}
var Ns = {},
	CA;
function vb() {
	return (
		CA ||
			((CA = 1),
			Object.defineProperty(Ns, '__esModule', { value: !0 }),
			(Ns.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PUBSUB', 'SHARDNUMSUB'), r && e.pushVariadic(r));
				},
				transformReply(e) {
					const r = Object.create(null);
					for (let n = 0; n < e.length; n += 2) r[e[n].toString()] = e[n + 1];
					return r;
				}
			})),
		Ns
	);
}
var Cs = {},
	IA;
function bb() {
	return (
		IA ||
			((IA = 1),
			Object.defineProperty(Cs, '__esModule', { value: !0 }),
			(Cs.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('PUBSUB', 'SHARDCHANNELS'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Cs
	);
}
var Is = {},
	LA;
function gb() {
	return (
		LA ||
			((LA = 1),
			Object.defineProperty(Is, '__esModule', { value: !0 }),
			(Is.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('RANDOMKEY');
				},
				transformReply: void 0
			})),
		Is
	);
}
var Ls = {},
	MA;
function Ub() {
	return (
		MA ||
			((MA = 1),
			Object.defineProperty(Ls, '__esModule', { value: !0 }),
			(Ls.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('READONLY');
				},
				transformReply: void 0
			})),
		Ls
	);
}
var Ms = {},
	DA;
function Gb() {
	return (
		DA ||
			((DA = 1),
			Object.defineProperty(Ms, '__esModule', { value: !0 }),
			(Ms.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('RENAME'), e.pushKeys([r, n]));
				},
				transformReply: void 0
			})),
		Ms
	);
}
var Ds = {},
	yA;
function Yb() {
	return (
		yA ||
			((yA = 1),
			Object.defineProperty(Ds, '__esModule', { value: !0 }),
			(Ds.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('RENAMENX'), e.pushKeys([r, n]));
				},
				transformReply: void 0
			})),
		Ds
	);
}
var ys = {},
	PA;
function Bb() {
	return (
		PA ||
			((PA = 1),
			Object.defineProperty(ys, '__esModule', { value: !0 }),
			(ys.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('REPLICAOF', r, n.toString());
				},
				transformReply: void 0
			})),
		ys
	);
}
var Ps = {},
	vA;
function qb() {
	return (
		vA ||
			((vA = 1),
			Object.defineProperty(Ps, '__esModule', { value: !0 }),
			(Ps.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('RESTORE-ASKING');
				},
				transformReply: void 0
			})),
		Ps
	);
}
var vs = {},
	bA;
function Hb() {
	return (
		bA ||
			((bA = 1),
			Object.defineProperty(vs, '__esModule', { value: !0 }),
			(vs.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('RESTORE'),
						e.pushKey(r),
						e.push(n.toString(), u),
						t?.REPLACE && e.push('REPLACE'),
						t?.ABSTTL && e.push('ABSTTL'),
						t?.IDLETIME && e.push('IDLETIME', t.IDLETIME.toString()),
						t?.FREQ && e.push('FREQ', t.FREQ.toString()));
				},
				transformReply: void 0
			})),
		vs
	);
}
var bs = {},
	gA;
function jb() {
	return (
		gA ||
			((gA = 1),
			Object.defineProperty(bs, '__esModule', { value: !0 }),
			(bs.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('ROLE');
				},
				transformReply(e) {
					switch (e[0]) {
						case 'master': {
							const [r, n, u] = e;
							return {
								role: r,
								replicationOffest: n,
								replicas: u.map((t) => {
									const [i, a, s] = t;
									return { host: i, port: Number(a), replicationOffest: Number(s) };
								})
							};
						}
						case 'slave': {
							const [r, n, u, t, i] = e;
							return { role: r, master: { host: n, port: u }, state: t, dataReceived: i };
						}
						case 'sentinel': {
							const [r, n] = e;
							return { role: r, masterNames: n };
						}
					}
				}
			})),
		bs
	);
}
var gs = {},
	UA;
function Fb() {
	return (
		UA ||
			((UA = 1),
			Object.defineProperty(gs, '__esModule', { value: !0 }),
			(gs.default = {
				parseCommand(e, r, n) {
					(e.push('RPOP'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		gs
	);
}
var Us = {},
	GA;
function Kb() {
	return (
		GA ||
			((GA = 1),
			Object.defineProperty(Us, '__esModule', { value: !0 }),
			(Us.default = {
				parseCommand(e, r) {
					(e.push('RPOP'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Us
	);
}
var Gs = {},
	YA;
function wb() {
	return (
		YA ||
			((YA = 1),
			Object.defineProperty(Gs, '__esModule', { value: !0 }),
			(Gs.default = {
				parseCommand(e, r, n) {
					(e.push('RPOPLPUSH'), e.pushKeys([r, n]));
				},
				transformReply: void 0
			})),
		Gs
	);
}
var Ys = {},
	BA;
function Xb() {
	return (
		BA ||
			((BA = 1),
			Object.defineProperty(Ys, '__esModule', { value: !0 }),
			(Ys.default = {
				parseCommand(e, r, n) {
					(e.push('RPUSH'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Ys
	);
}
var Bs = {},
	qA;
function Vb() {
	return (
		qA ||
			((qA = 1),
			Object.defineProperty(Bs, '__esModule', { value: !0 }),
			(Bs.default = {
				parseCommand(e, r, n) {
					(e.push('RPUSHX'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Bs
	);
}
var qs = {},
	HA;
function Wb() {
	return (
		HA ||
			((HA = 1),
			Object.defineProperty(qs, '__esModule', { value: !0 }),
			(qs.default = {
				parseCommand(e, r, n) {
					(e.push('SADD'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		qs
	);
}
var Hs = {},
	jA;
function xb() {
	return (
		jA ||
			((jA = 1),
			Object.defineProperty(Hs, '__esModule', { value: !0 }),
			(Hs.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SCARD'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Hs
	);
}
var js = {},
	FA;
function Zb() {
	return (
		FA ||
			((FA = 1),
			Object.defineProperty(js, '__esModule', { value: !0 }),
			(js.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('SCRIPT', 'DEBUG', r);
				},
				transformReply: void 0
			})),
		js
	);
}
var Fs = {},
	KA;
function Jb() {
	return (
		KA ||
			((KA = 1),
			Object.defineProperty(Fs, '__esModule', { value: !0 }),
			(Fs.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SCRIPT', 'EXISTS'), e.pushVariadic(r));
				},
				transformReply: void 0
			})),
		Fs
	);
}
var Ks = {},
	wA;
function zb() {
	return (
		wA ||
			((wA = 1),
			Object.defineProperty(Ks, '__esModule', { value: !0 }),
			(Ks.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SCRIPT', 'FLUSH'), r && e.push(r));
				},
				transformReply: void 0
			})),
		Ks
	);
}
var ws = {},
	XA;
function Qb() {
	return (
		XA ||
			((XA = 1),
			Object.defineProperty(ws, '__esModule', { value: !0 }),
			(ws.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('SCRIPT', 'KILL');
				},
				transformReply: void 0
			})),
		ws
	);
}
var Xs = {},
	VA;
function kb() {
	return (
		VA ||
			((VA = 1),
			Object.defineProperty(Xs, '__esModule', { value: !0 }),
			(Xs.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('SCRIPT', 'LOAD', r);
				},
				transformReply: void 0
			})),
		Xs
	);
}
var Vs = {},
	WA;
function $b() {
	return (
		WA ||
			((WA = 1),
			Object.defineProperty(Vs, '__esModule', { value: !0 }),
			(Vs.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SDIFF'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		Vs
	);
}
var Ws = {},
	xA;
function eg() {
	return (
		xA ||
			((xA = 1),
			Object.defineProperty(Ws, '__esModule', { value: !0 }),
			(Ws.default = {
				parseCommand(e, r, n) {
					(e.push('SDIFFSTORE'), e.pushKey(r), e.pushKeys(n));
				},
				transformReply: void 0
			})),
		Ws
	);
}
var xs = {},
	ZA;
function tg() {
	return (
		ZA ||
			((ZA = 1),
			Object.defineProperty(xs, '__esModule', { value: !0 }),
			(xs.default = {
				parseCommand(e, r, n, u) {
					(e.push('SET'),
						e.pushKey(r),
						e.push(typeof n == 'number' ? n.toString() : n),
						u?.expiration
							? typeof u.expiration == 'string'
								? e.push(u.expiration)
								: u.expiration.type === 'KEEPTTL'
									? e.push('KEEPTTL')
									: e.push(u.expiration.type, u.expiration.value.toString())
							: u?.EX !== void 0
								? e.push('EX', u.EX.toString())
								: u?.PX !== void 0
									? e.push('PX', u.PX.toString())
									: u?.EXAT !== void 0
										? e.push('EXAT', u.EXAT.toString())
										: u?.PXAT !== void 0
											? e.push('PXAT', u.PXAT.toString())
											: u?.KEEPTTL && e.push('KEEPTTL'),
						u?.condition ? (e.push(u.condition), u?.matchValue !== void 0 && e.push(u.matchValue)) : u?.NX ? e.push('NX') : u?.XX && e.push('XX'),
						u?.GET && e.push('GET'));
				},
				transformReply: void 0
			})),
		xs
	);
}
var Zs = {},
	JA;
function rg() {
	return (
		JA ||
			((JA = 1),
			Object.defineProperty(Zs, '__esModule', { value: !0 }),
			(Zs.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('SETBIT'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		Zs
	);
}
var Js = {},
	zA;
function ng() {
	return (
		zA ||
			((zA = 1),
			Object.defineProperty(Js, '__esModule', { value: !0 }),
			(Js.default = {
				parseCommand(e, r, n, u) {
					(e.push('SETEX'), e.pushKey(r), e.push(n.toString(), u));
				},
				transformReply: void 0
			})),
		Js
	);
}
var zs = {},
	QA;
function ug() {
	return (
		QA ||
			((QA = 1),
			Object.defineProperty(zs, '__esModule', { value: !0 }),
			(zs.default = {
				parseCommand(e, r, n) {
					(e.push('SETNX'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		zs
	);
}
var Qs = {},
	kA;
function ig() {
	return (
		kA ||
			((kA = 1),
			Object.defineProperty(Qs, '__esModule', { value: !0 }),
			(Qs.default = {
				parseCommand(e, r, n, u) {
					(e.push('SETRANGE'), e.pushKey(r), e.push(n.toString(), u));
				},
				transformReply: void 0
			})),
		Qs
	);
}
var ks = {},
	$A;
function sg() {
	return (
		$A ||
			(($A = 1),
			Object.defineProperty(ks, '__esModule', { value: !0 }),
			(ks.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SINTER'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		ks
	);
}
var $s = {},
	ep;
function ag() {
	return (
		ep ||
			((ep = 1),
			Object.defineProperty($s, '__esModule', { value: !0 }),
			($s.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('SINTERCARD'),
						e.pushKeysLength(r),
						typeof n == 'number' ? e.push('LIMIT', n.toString()) : n?.LIMIT !== void 0 && e.push('LIMIT', n.LIMIT.toString()));
				},
				transformReply: void 0
			})),
		$s
	);
}
var ea = {},
	tp;
function og() {
	return (
		tp ||
			((tp = 1),
			Object.defineProperty(ea, '__esModule', { value: !0 }),
			(ea.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('SINTERSTORE'), e.pushKey(r), e.pushKeys(n));
				},
				transformReply: void 0
			})),
		ea
	);
}
var ta = {},
	rp;
function fg() {
	return (
		rp ||
			((rp = 1),
			Object.defineProperty(ta, '__esModule', { value: !0 }),
			(ta.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('SISMEMBER'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		ta
	);
}
var ra = {},
	np;
function dg() {
	return (
		np ||
			((np = 1),
			Object.defineProperty(ra, '__esModule', { value: !0 }),
			(ra.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SMEMBERS'), e.pushKey(r));
				},
				transformReply: { 2: void 0, 3: void 0 }
			})),
		ra
	);
}
var na = {},
	up;
function lg() {
	return (
		up ||
			((up = 1),
			Object.defineProperty(na, '__esModule', { value: !0 }),
			(na.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('SMISMEMBER'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		na
	);
}
var ua = {},
	ip;
function cg() {
	return (
		ip ||
			((ip = 1),
			Object.defineProperty(ua, '__esModule', { value: !0 }),
			(ua.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('SMOVE'), e.pushKeys([r, n]), e.push(u));
				},
				transformReply: void 0
			})),
		ua
	);
}
var Se = {},
	vt = {},
	sp;
function nl() {
	if (sp) return vt;
	((sp = 1), Object.defineProperty(vt, '__esModule', { value: !0 }), (vt.parseSortArguments = void 0));
	function e(r, n, u) {
		if ((r.pushKey(n), u?.BY && r.push('BY', u.BY), u?.LIMIT && r.push('LIMIT', u.LIMIT.offset.toString(), u.LIMIT.count.toString()), u?.GET))
			if (Array.isArray(u.GET)) for (const t of u.GET) r.push('GET', t);
			else r.push('GET', u.GET);
		(u?.DIRECTION && r.push(u.DIRECTION), u?.ALPHA && r.push('ALPHA'));
	}
	return (
		(vt.parseSortArguments = e),
		(vt.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('SORT'), e(r, n, u));
			},
			transformReply: void 0
		}),
		vt
	);
}
var ap;
function _g() {
	if (ap) return Se;
	ap = 1;
	var e =
			(Se && Se.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Se && Se.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Se && Se.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Se, '__esModule', { value: !0 });
	const u = n(nl());
	return (
		(Se.default = {
			IS_READ_ONLY: !0,
			parseCommand(...t) {
				(t[0].push('SORT_RO'), (0, u.parseSortArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		Se
	);
}
var bt = {},
	op;
function Eg() {
	if (op) return bt;
	op = 1;
	var e =
		(bt && bt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(bt, '__esModule', { value: !0 });
	const r = e(nl());
	return (
		(bt.default = {
			IS_READ_ONLY: !1,
			parseCommand(n, u, t, i) {
				(r.default.parseCommand(n, u, i), n.push('STORE', t));
			},
			transformReply: void 0
		}),
		bt
	);
}
var ia = {},
	fp;
function Rg() {
	return (
		fp ||
			((fp = 1),
			Object.defineProperty(ia, '__esModule', { value: !0 }),
			(ia.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('SPOP'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply: void 0
			})),
		ia
	);
}
var sa = {},
	dp;
function hg() {
	return (
		dp ||
			((dp = 1),
			Object.defineProperty(sa, '__esModule', { value: !0 }),
			(sa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('SPOP'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		sa
	);
}
var aa = {},
	lp;
function Sg() {
	return (
		lp ||
			((lp = 1),
			Object.defineProperty(aa, '__esModule', { value: !0 }),
			(aa.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('SPUBLISH'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		aa
	);
}
var gt = {},
	oa = {},
	cp;
function ZM() {
	return (
		cp ||
			((cp = 1),
			Object.defineProperty(oa, '__esModule', { value: !0 }),
			(oa.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SRANDMEMBER'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		oa
	);
}
var _p;
function mg() {
	if (_p) return gt;
	_p = 1;
	var e =
		(gt && gt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(gt, '__esModule', { value: !0 });
	const r = e(ZM());
	return (
		(gt.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u, t) {
				(r.default.parseCommand(n, u), n.push(t.toString()));
			},
			transformReply: void 0
		}),
		gt
	);
}
var fa = {},
	Ep;
function Og() {
	return (
		Ep ||
			((Ep = 1),
			Object.defineProperty(fa, '__esModule', { value: !0 }),
			(fa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('SREM'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		fa
	);
}
var da = {},
	Rp;
function Tg() {
	if (Rp) return da;
	((Rp = 1), Object.defineProperty(da, '__esModule', { value: !0 }));
	const e = gd();
	return (
		(da.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				(r.push('SSCAN'), r.pushKey(n), (0, e.parseScanArguments)(r, u, t));
			},
			transformReply([r, n]) {
				return { cursor: r, members: n };
			}
		}),
		da
	);
}
var la = {},
	hp;
function Ag() {
	return (
		hp ||
			((hp = 1),
			Object.defineProperty(la, '__esModule', { value: !0 }),
			(la.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('STRLEN'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		la
	);
}
var ca = {},
	Sp;
function pg() {
	return (
		Sp ||
			((Sp = 1),
			Object.defineProperty(ca, '__esModule', { value: !0 }),
			(ca.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('SUNION'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		ca
	);
}
var _a = {},
	mp;
function Ng() {
	return (
		mp ||
			((mp = 1),
			Object.defineProperty(_a, '__esModule', { value: !0 }),
			(_a.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('SUNIONSTORE'), e.pushKey(r), e.pushKeys(n));
				},
				transformReply: void 0
			})),
		_a
	);
}
var Ea = {},
	Op;
function Cg() {
	return (
		Op ||
			((Op = 1),
			Object.defineProperty(Ea, '__esModule', { value: !0 }),
			(Ea.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					e.push('SWAPDB', r.toString(), n.toString());
				},
				transformReply: void 0
			})),
		Ea
	);
}
var Ra = {},
	Tp;
function Ig() {
	return (
		Tp ||
			((Tp = 1),
			Object.defineProperty(Ra, '__esModule', { value: !0 }),
			(Ra.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('TIME');
				},
				transformReply: void 0
			})),
		Ra
	);
}
var ha = {},
	Ap;
function Lg() {
	return (
		Ap ||
			((Ap = 1),
			Object.defineProperty(ha, '__esModule', { value: !0 }),
			(ha.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('TOUCH'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		ha
	);
}
var Sa = {},
	pp;
function Mg() {
	return (
		pp ||
			((pp = 1),
			Object.defineProperty(Sa, '__esModule', { value: !0 }),
			(Sa.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('TTL'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Sa
	);
}
var ma = {},
	Np;
function Dg() {
	return (
		Np ||
			((Np = 1),
			Object.defineProperty(ma, '__esModule', { value: !0 }),
			(ma.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('TYPE'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		ma
	);
}
var Oa = {},
	Cp;
function yg() {
	return (
		Cp ||
			((Cp = 1),
			Object.defineProperty(Oa, '__esModule', { value: !0 }),
			(Oa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('UNLINK'), e.pushKeys(r));
				},
				transformReply: void 0
			})),
		Oa
	);
}
var Ta = {},
	Ip;
function Pg() {
	return (
		Ip ||
			((Ip = 1),
			Object.defineProperty(Ta, '__esModule', { value: !0 }),
			(Ta.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('WAIT', r.toString(), n.toString());
				},
				transformReply: void 0
			})),
		Ta
	);
}
var Aa = {},
	Lp;
function vg() {
	return (
		Lp ||
			((Lp = 1),
			Object.defineProperty(Aa, '__esModule', { value: !0 }),
			(Aa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('XACK'), e.pushKey(r), e.push(n), e.pushVariadic(u));
				},
				transformReply: void 0
			})),
		Aa
	);
}
var pa = {},
	Mp;
function bg() {
	return (
		Mp ||
			((Mp = 1),
			Object.defineProperty(pa, '__esModule', { value: !0 }),
			(pa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('XACKDEL'), e.pushKey(r), e.push(n), t && e.push(t), e.push('IDS'), e.pushVariadicWithLength(u));
				},
				transformReply: void 0
			})),
		pa
	);
}
var Na = {},
	Ut = {},
	Dp;
function JM() {
	if (Dp) return Ut;
	((Dp = 1), Object.defineProperty(Ut, '__esModule', { value: !0 }), (Ut.parseXAddArguments = void 0));
	function e(r, n, u, t, i, a) {
		(n.push('XADD'),
			n.pushKey(u),
			r && n.push(r),
			a?.TRIM &&
				(a.TRIM.strategy && n.push(a.TRIM.strategy),
				a.TRIM.strategyModifier && n.push(a.TRIM.strategyModifier),
				n.push(a.TRIM.threshold.toString()),
				a.TRIM.limit && n.push('LIMIT', a.TRIM.limit.toString()),
				a.TRIM.policy && n.push(a.TRIM.policy)),
			n.push(t));
		for (const [s, o] of Object.entries(i)) n.push(s, o);
	}
	return (
		(Ut.parseXAddArguments = e),
		(Ut.default = {
			IS_READ_ONLY: !1,
			parseCommand(...r) {
				return e(void 0, ...r);
			},
			transformReply: void 0
		}),
		Ut
	);
}
var yp;
function gg() {
	if (yp) return Na;
	((yp = 1), Object.defineProperty(Na, '__esModule', { value: !0 }));
	const e = JM();
	return (
		(Na.default = {
			IS_READ_ONLY: !1,
			parseCommand(...r) {
				return (0, e.parseXAddArguments)('NOMKSTREAM', ...r);
			},
			transformReply: void 0
		}),
		Na
	);
}
var Gt = {},
	Ca = {},
	Pp;
function zM() {
	if (Pp) return Ca;
	((Pp = 1), Object.defineProperty(Ca, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Ca.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i, a, s) {
				(r.push('XAUTOCLAIM'), r.pushKey(n), r.push(u, t, i.toString(), a), s?.COUNT && r.push('COUNT', s.COUNT.toString()));
			},
			transformReply(r, n, u) {
				return { nextId: r[0], messages: r[1].map(e.transformStreamMessageNullReply.bind(void 0, u)), deletedMessages: r[2] };
			}
		}),
		Ca
	);
}
var vp;
function Ug() {
	if (vp) return Gt;
	vp = 1;
	var e =
		(Gt && Gt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Gt, '__esModule', { value: !0 });
	const r = e(zM());
	return (
		(Gt.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				const u = n[0];
				(r.default.parseCommand(...n), u.push('JUSTID'));
			},
			transformReply(n) {
				return { nextId: n[0], messages: n[1], deletedMessages: n[2] };
			}
		}),
		Gt
	);
}
var Yt = {},
	Ia = {},
	bp;
function QM() {
	if (bp) return Ia;
	((bp = 1), Object.defineProperty(Ia, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Ia.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i, a, s) {
				(r.push('XCLAIM'),
					r.pushKey(n),
					r.push(u, t, i.toString()),
					r.pushVariadic(a),
					s?.IDLE !== void 0 && r.push('IDLE', s.IDLE.toString()),
					s?.TIME !== void 0 && r.push('TIME', (s.TIME instanceof Date ? s.TIME.getTime() : s.TIME).toString()),
					s?.RETRYCOUNT !== void 0 && r.push('RETRYCOUNT', s.RETRYCOUNT.toString()),
					s?.FORCE && r.push('FORCE'),
					s?.LASTID !== void 0 && r.push('LASTID', s.LASTID));
			},
			transformReply(r, n, u) {
				return r.map(e.transformStreamMessageNullReply.bind(void 0, u));
			}
		}),
		Ia
	);
}
var gp;
function Gg() {
	if (gp) return Yt;
	gp = 1;
	var e =
		(Yt && Yt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Yt, '__esModule', { value: !0 });
	const r = e(QM());
	return (
		(Yt.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				const u = n[0];
				(r.default.parseCommand(...n), u.push('JUSTID'));
			},
			transformReply: void 0
		}),
		Yt
	);
}
var La = {},
	Up;
function Yg() {
	return (
		Up ||
			((Up = 1),
			Object.defineProperty(La, '__esModule', { value: !0 }),
			(La.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('XDEL'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		La
	);
}
var Ma = {},
	Gp;
function Bg() {
	return (
		Gp ||
			((Gp = 1),
			Object.defineProperty(Ma, '__esModule', { value: !0 }),
			(Ma.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('XDELEX'), e.pushKey(r), u && e.push(u), e.push('IDS'), e.pushVariadicWithLength(n));
				},
				transformReply: void 0
			})),
		Ma
	);
}
var Da = {},
	Yp;
function qg() {
	return (
		Yp ||
			((Yp = 1),
			Object.defineProperty(Da, '__esModule', { value: !0 }),
			(Da.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('XGROUP', 'CREATE'),
						e.pushKey(r),
						e.push(n, u),
						t?.MKSTREAM && e.push('MKSTREAM'),
						t?.ENTRIESREAD && e.push('ENTRIESREAD', t.ENTRIESREAD.toString()));
				},
				transformReply: void 0
			})),
		Da
	);
}
var ya = {},
	Bp;
function Hg() {
	return (
		Bp ||
			((Bp = 1),
			Object.defineProperty(ya, '__esModule', { value: !0 }),
			(ya.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('XGROUP', 'CREATECONSUMER'), e.pushKey(r), e.push(n, u));
				},
				transformReply: void 0
			})),
		ya
	);
}
var Pa = {},
	qp;
function jg() {
	return (
		qp ||
			((qp = 1),
			Object.defineProperty(Pa, '__esModule', { value: !0 }),
			(Pa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('XGROUP', 'DELCONSUMER'), e.pushKey(r), e.push(n, u));
				},
				transformReply: void 0
			})),
		Pa
	);
}
var va = {},
	Hp;
function Fg() {
	return (
		Hp ||
			((Hp = 1),
			Object.defineProperty(va, '__esModule', { value: !0 }),
			(va.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('XGROUP', 'DESTROY'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		va
	);
}
var ba = {},
	jp;
function Kg() {
	return (
		jp ||
			((jp = 1),
			Object.defineProperty(ba, '__esModule', { value: !0 }),
			(ba.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('XGROUP', 'SETID'), e.pushKey(r), e.push(n, u), t?.ENTRIESREAD && e.push('ENTRIESREAD', t.ENTRIESREAD.toString()));
				},
				transformReply: void 0
			})),
		ba
	);
}
var ga = {},
	Fp;
function wg() {
	return (
		Fp ||
			((Fp = 1),
			Object.defineProperty(ga, '__esModule', { value: !0 }),
			(ga.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('XINFO', 'CONSUMERS'), e.pushKey(r), e.push(n));
				},
				transformReply: {
					2: (e) =>
						e.map((r) => {
							const n = r;
							return { name: n[1], pending: n[3], idle: n[5], inactive: n[7] };
						}),
					3: void 0
				}
			})),
		ga
	);
}
var Ua = {},
	Kp;
function Xg() {
	return (
		Kp ||
			((Kp = 1),
			Object.defineProperty(Ua, '__esModule', { value: !0 }),
			(Ua.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('XINFO', 'GROUPS'), e.pushKey(r));
				},
				transformReply: {
					2: (e) =>
						e.map((r) => {
							const n = r;
							return { name: n[1], consumers: n[3], pending: n[5], 'last-delivered-id': n[7], 'entries-read': n[9], lag: n[11] };
						}),
					3: void 0
				}
			})),
		Ua
	);
}
var Ga = {},
	wp;
function Vg() {
	if (wp) return Ga;
	((wp = 1), Object.defineProperty(Ga, '__esModule', { value: !0 }));
	const e = L();
	Ga.default = {
		IS_READ_ONLY: !0,
		parseCommand(n, u) {
			(n.push('XINFO', 'STREAM'), n.pushKey(u));
		},
		transformReply: {
			2(n) {
				const u = {};
				for (let t = 0; t < n.length; t += 2)
					switch (n[t]) {
						case 'first-entry':
						case 'last-entry':
							u[n[t]] = r(n[t + 1]);
							break;
						default:
							u[n[t]] = n[t + 1];
							break;
					}
				return u;
			},
			3(n) {
				return (
					n instanceof Map
						? (n.set('first-entry', r(n.get('first-entry'))), n.set('last-entry', r(n.get('last-entry'))))
						: n instanceof Array
							? ((n[17] = r(n[17])), (n[19] = r(n[19])))
							: ((n['first-entry'] = r(n['first-entry'])), (n['last-entry'] = r(n['last-entry']))),
					n
				);
			}
		}
	};
	function r(n) {
		if ((0, e.isNullReply)(n)) return n;
		const [u, t] = n;
		return { id: u, message: (0, e.transformTuplesReply)(t) };
	}
	return Ga;
}
var Ya = {},
	Xp;
function Wg() {
	return (
		Xp ||
			((Xp = 1),
			Object.defineProperty(Ya, '__esModule', { value: !0 }),
			(Ya.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('XLEN'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Ya
	);
}
var Ba = {},
	Vp;
function xg() {
	return (
		Vp ||
			((Vp = 1),
			Object.defineProperty(Ba, '__esModule', { value: !0 }),
			(Ba.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t, i, a) {
					(e.push('XPENDING'),
						e.pushKey(r),
						e.push(n),
						a?.IDLE !== void 0 && e.push('IDLE', a.IDLE.toString()),
						e.push(u, t, i.toString()),
						a?.consumer && e.push(a.consumer));
				},
				transformReply(e) {
					return e.map((r) => {
						const n = r;
						return { id: n[0], consumer: n[1], millisecondsSinceLastDelivery: n[2], deliveriesCounter: n[3] };
					});
				}
			})),
		Ba
	);
}
var qa = {},
	Wp;
function Zg() {
	return (
		Wp ||
			((Wp = 1),
			Object.defineProperty(qa, '__esModule', { value: !0 }),
			(qa.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('XPENDING'), e.pushKey(r), e.push(n));
				},
				transformReply(e) {
					const r = e[3];
					return {
						pending: e[0],
						firstId: e[1],
						lastId: e[2],
						consumers:
							r === null
								? null
								: r.map((n) => {
										const [u, t] = n;
										return { name: u, deliveriesCounter: Number(t) };
									})
					};
				}
			})),
		qa
	);
}
var Bt = {},
	xp;
function kM() {
	if (xp) return Bt;
	((xp = 1), Object.defineProperty(Bt, '__esModule', { value: !0 }), (Bt.xRangeArguments = void 0));
	const e = L();
	function r(n, u, t) {
		const i = [n, u];
		return (t?.COUNT && i.push('COUNT', t.COUNT.toString()), i);
	}
	return (
		(Bt.xRangeArguments = r),
		(Bt.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(n, u, ...t) {
				(n.push('XRANGE'), n.pushKey(u), n.pushVariadic(r(t[0], t[1], t[2])));
			},
			transformReply(n, u, t) {
				return n.map(e.transformStreamMessageReply.bind(void 0, t));
			}
		}),
		Bt
	);
}
var qt = {},
	Zp;
function $M() {
	if (Zp) return qt;
	((Zp = 1), Object.defineProperty(qt, '__esModule', { value: !0 }), (qt.pushXReadStreams = void 0));
	const e = L();
	function r(n, u) {
		if ((n.push('STREAMS'), Array.isArray(u))) {
			for (let t = 0; t < u.length; t++) n.pushKey(u[t].key);
			for (let t = 0; t < u.length; t++) n.push(u[t].id);
		} else (n.pushKey(u.key), n.push(u.id));
	}
	return (
		(qt.pushXReadStreams = r),
		(qt.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u, t) {
				(n.push('XREAD'), t?.COUNT && n.push('COUNT', t.COUNT.toString()), t?.BLOCK !== void 0 && n.push('BLOCK', t.BLOCK.toString()), r(n, u));
			},
			transformReply: { 2: e.transformStreamsMessagesReplyResp2, 3: void 0 },
			unstableResp3: !0
		}),
		qt
	);
}
var Ha = {},
	Jp;
function Jg() {
	if (Jp) return Ha;
	((Jp = 1), Object.defineProperty(Ha, '__esModule', { value: !0 }));
	const e = $M(),
		r = L();
	return (
		(Ha.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u, t, i, a) {
				(n.push('XREADGROUP', 'GROUP', u, t),
					a?.COUNT !== void 0 && n.push('COUNT', a.COUNT.toString()),
					a?.BLOCK !== void 0 && n.push('BLOCK', a.BLOCK.toString()),
					a?.NOACK && n.push('NOACK'),
					a?.CLAIM !== void 0 && n.push('CLAIM', a.CLAIM.toString()),
					(0, e.pushXReadStreams)(n, i));
			},
			transformReply: { 2: r.transformStreamsMessagesReplyResp2, 3: void 0 }
		}),
		Ha
	);
}
var me = {},
	zp;
function zg() {
	if (zp) return me;
	zp = 1;
	var e =
			(me && me.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(me && me.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(me && me.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(me, '__esModule', { value: !0 });
	const u = n(kM());
	return (
		(me.default = {
			CACHEABLE: u.default.CACHEABLE,
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(t, i, ...a) {
				(t.push('XREVRANGE'), t.pushKey(i), t.pushVariadic((0, u.xRangeArguments)(a[0], a[1], a[2])));
			},
			transformReply: u.default.transformReply
		}),
		me
	);
}
var ja = {},
	Qp;
function Qg() {
	return (
		Qp ||
			((Qp = 1),
			Object.defineProperty(ja, '__esModule', { value: !0 }),
			(ja.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('XSETID'),
						e.pushKey(r),
						e.push(n),
						u?.ENTRIESADDED && e.push('ENTRIESADDED', u.ENTRIESADDED.toString()),
						u?.MAXDELETEDID && e.push('MAXDELETEDID', u.MAXDELETEDID));
				},
				transformReply: void 0
			})),
		ja
	);
}
var Fa = {},
	kp;
function kg() {
	return (
		kp ||
			((kp = 1),
			Object.defineProperty(Fa, '__esModule', { value: !0 }),
			(Fa.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('XTRIM'),
						e.pushKey(r),
						e.push(n),
						t?.strategyModifier && e.push(t.strategyModifier),
						e.push(u.toString()),
						t?.LIMIT && e.push('LIMIT', t.LIMIT.toString()),
						t?.policy && e.push(t.policy));
				},
				transformReply: void 0
			})),
		Fa
	);
}
var Ka = {},
	Ht = {},
	$p;
function eD() {
	if ($p) return Ht;
	(($p = 1), Object.defineProperty(Ht, '__esModule', { value: !0 }), (Ht.pushMembers = void 0));
	const e = L();
	Ht.default = {
		parseCommand(u, t, i, a) {
			(u.push('ZADD'),
				u.pushKey(t),
				a?.condition ? u.push(a.condition) : a?.NX ? u.push('NX') : a?.XX && u.push('XX'),
				a?.comparison ? u.push(a.comparison) : a?.LT ? u.push('LT') : a?.GT && u.push('GT'),
				a?.CH && u.push('CH'),
				r(u, i));
		},
		transformReply: e.transformDoubleReply
	};
	function r(u, t) {
		if (Array.isArray(t)) for (const i of t) n(u, i);
		else n(u, t);
	}
	Ht.pushMembers = r;
	function n(u, t) {
		u.push((0, e.transformDoubleArgument)(t.score), t.value);
	}
	return Ht;
}
var eN;
function $g() {
	if (eN) return Ka;
	((eN = 1), Object.defineProperty(Ka, '__esModule', { value: !0 }));
	const e = eD(),
		r = L();
	return (
		(Ka.default = {
			parseCommand(n, u, t, i) {
				(n.push('ZADD'),
					n.pushKey(u),
					i?.condition && n.push(i.condition),
					i?.comparison && n.push(i.comparison),
					i?.CH && n.push('CH'),
					n.push('INCR'),
					(0, e.pushMembers)(n, t));
			},
			transformReply: r.transformNullableDoubleReply
		}),
		Ka
	);
}
var wa = {},
	tN;
function eU() {
	return (
		tN ||
			((tN = 1),
			Object.defineProperty(wa, '__esModule', { value: !0 }),
			(wa.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('ZCARD'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		wa
	);
}
var Xa = {},
	rN;
function tU() {
	if (rN) return Xa;
	((rN = 1), Object.defineProperty(Xa, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Xa.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				(r.push('ZCOUNT'), r.pushKey(n), r.push((0, e.transformStringDoubleArgument)(u), (0, e.transformStringDoubleArgument)(t)));
			},
			transformReply: void 0
		}),
		Xa
	);
}
var jt = {},
	Va = {},
	nN;
function tD() {
	return (
		nN ||
			((nN = 1),
			Object.defineProperty(Va, '__esModule', { value: !0 }),
			(Va.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('ZDIFF'), e.pushKeysLength(r));
				},
				transformReply: void 0
			})),
		Va
	);
}
var uN;
function rU() {
	if (uN) return jt;
	uN = 1;
	var e =
		(jt && jt.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(jt, '__esModule', { value: !0 });
	const r = L(),
		n = e(tD());
	return (
		(jt.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(u, t) {
				(n.default.parseCommand(u, t), u.push('WITHSCORES'));
			},
			transformReply: r.transformSortedSetReply
		}),
		jt
	);
}
var Wa = {},
	iN;
function nU() {
	return (
		iN ||
			((iN = 1),
			Object.defineProperty(Wa, '__esModule', { value: !0 }),
			(Wa.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('ZDIFFSTORE'), e.pushKey(r), e.pushKeysLength(n));
				},
				transformReply: void 0
			})),
		Wa
	);
}
var xa = {},
	sN;
function uU() {
	if (sN) return xa;
	((sN = 1), Object.defineProperty(xa, '__esModule', { value: !0 }));
	const e = L();
	return (
		(xa.default = {
			parseCommand(r, n, u, t) {
				(r.push('ZINCRBY'), r.pushKey(n), r.push((0, e.transformDoubleArgument)(u), t));
			},
			transformReply: e.transformDoubleReply
		}),
		xa
	);
}
var Ft = {},
	Kt = {},
	aN;
function ul() {
	if (aN) return Kt;
	((aN = 1), Object.defineProperty(Kt, '__esModule', { value: !0 }), (Kt.parseZInterArguments = void 0));
	const e = L();
	function r(n, u, t) {
		((0, e.parseZKeysArguments)(n, u), t?.AGGREGATE && n.push('AGGREGATE', t.AGGREGATE));
	}
	return (
		(Kt.parseZInterArguments = r),
		(Kt.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u, t) {
				(n.push('ZINTER'), r(n, u, t));
			},
			transformReply: void 0
		}),
		Kt
	);
}
var oN;
function iU() {
	if (oN) return Ft;
	oN = 1;
	var e =
		(Ft && Ft.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(Ft, '__esModule', { value: !0 });
	const r = L(),
		n = e(ul());
	return (
		(Ft.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				(n.default.parseCommand(...u), u[0].push('WITHSCORES'));
			},
			transformReply: r.transformSortedSetReply
		}),
		Ft
	);
}
var Za = {},
	fN;
function sU() {
	return (
		fN ||
			((fN = 1),
			Object.defineProperty(Za, '__esModule', { value: !0 }),
			(Za.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('ZINTERCARD'),
						e.pushKeysLength(r),
						typeof n == 'number' ? e.push('LIMIT', n.toString()) : n?.LIMIT && e.push('LIMIT', n.LIMIT.toString()));
				},
				transformReply: void 0
			})),
		Za
	);
}
var Ja = {},
	dN;
function aU() {
	if (dN) return Ja;
	((dN = 1), Object.defineProperty(Ja, '__esModule', { value: !0 }));
	const e = ul();
	return (
		(Ja.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('ZINTERSTORE'), r.pushKey(n), (0, e.parseZInterArguments)(r, u, t));
			},
			transformReply: void 0
		}),
		Ja
	);
}
var za = {},
	lN;
function oU() {
	return (
		lN ||
			((lN = 1),
			Object.defineProperty(za, '__esModule', { value: !0 }),
			(za.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('ZLEXCOUNT'), e.pushKey(r), e.push(n), e.push(u));
				},
				transformReply: void 0
			})),
		za
	);
}
var Qa = {},
	cN;
function fU() {
	if (cN) return Qa;
	((cN = 1), Object.defineProperty(Qa, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Qa.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('ZMSCORE'), r.pushKey(n), r.pushVariadic(u));
			},
			transformReply: { 2: (r, n, u) => r.map((0, e.createTransformNullableDoubleReplyResp2Func)(n, u)), 3: void 0 }
		}),
		Qa
	);
}
var ka = {},
	_N;
function dU() {
	if (_N) return ka;
	((_N = 1), Object.defineProperty(ka, '__esModule', { value: !0 }));
	const e = L();
	return (
		(ka.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('ZPOPMAX'), r.pushKey(n), r.push(u.toString()));
			},
			transformReply: e.transformSortedSetReply
		}),
		ka
	);
}
var $a = {},
	EN;
function rD() {
	if (EN) return $a;
	((EN = 1), Object.defineProperty($a, '__esModule', { value: !0 }));
	const e = L();
	return (
		($a.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n) {
				(r.push('ZPOPMAX'), r.pushKey(n));
			},
			transformReply: {
				2: (r, n, u) => (r.length === 0 ? null : { value: r[0], score: e.transformDoubleReply[2](r[1], n, u) }),
				3: (r) => (r.length === 0 ? null : { value: r[0], score: r[1] })
			}
		}),
		$a
	);
}
var eo = {},
	RN;
function lU() {
	if (RN) return eo;
	((RN = 1), Object.defineProperty(eo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(eo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('ZPOPMIN'), r.pushKey(n), r.push(u.toString()));
			},
			transformReply: e.transformSortedSetReply
		}),
		eo
	);
}
var wt = {},
	hN;
function cU() {
	if (hN) return wt;
	hN = 1;
	var e =
		(wt && wt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(wt, '__esModule', { value: !0 });
	const r = e(rD());
	return (
		(wt.default = {
			IS_READ_ONLY: !1,
			parseCommand(n, u) {
				(n.push('ZPOPMIN'), n.pushKey(u));
			},
			transformReply: r.default.transformReply
		}),
		wt
	);
}
var Xt = {},
	Vt = {},
	to = {},
	SN;
function nD() {
	return (
		SN ||
			((SN = 1),
			Object.defineProperty(to, '__esModule', { value: !0 }),
			(to.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('ZRANDMEMBER'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		to
	);
}
var mN;
function uD() {
	if (mN) return Vt;
	mN = 1;
	var e =
		(Vt && Vt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Vt, '__esModule', { value: !0 });
	const r = e(nD());
	return (
		(Vt.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u, t) {
				(r.default.parseCommand(n, u), n.push(t.toString()));
			},
			transformReply: void 0
		}),
		Vt
	);
}
var ON;
function _U() {
	if (ON) return Xt;
	ON = 1;
	var e =
		(Xt && Xt.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(Xt, '__esModule', { value: !0 });
	const r = L(),
		n = e(uD());
	return (
		(Xt.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(u, t, i) {
				(n.default.parseCommand(u, t, i), u.push('WITHSCORES'));
			},
			transformReply: r.transformSortedSetReply
		}),
		Xt
	);
}
var Wt = {},
	xt = {},
	TN;
function iD() {
	if (TN) return xt;
	((TN = 1), Object.defineProperty(xt, '__esModule', { value: !0 }), (xt.zRangeArgument = void 0));
	const e = L();
	function r(n, u, t) {
		const i = [(0, e.transformStringDoubleArgument)(n), (0, e.transformStringDoubleArgument)(u)];
		switch (t?.BY) {
			case 'SCORE':
				i.push('BYSCORE');
				break;
			case 'LEX':
				i.push('BYLEX');
				break;
		}
		return (t?.REV && i.push('REV'), t?.LIMIT && i.push('LIMIT', t.LIMIT.offset.toString(), t.LIMIT.count.toString()), i);
	}
	return (
		(xt.zRangeArgument = r),
		(xt.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(n, u, t, i, a) {
				(n.push('ZRANGE'), n.pushKey(u), n.pushVariadic(r(t, i, a)));
			},
			transformReply: void 0
		}),
		xt
	);
}
var AN;
function EU() {
	if (AN) return Wt;
	AN = 1;
	var e =
		(Wt && Wt.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(Wt, '__esModule', { value: !0 });
	const r = L(),
		n = e(iD());
	return (
		(Wt.default = {
			CACHEABLE: n.default.CACHEABLE,
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				const t = u[0];
				(n.default.parseCommand(...u), t.push('WITHSCORES'));
			},
			transformReply: r.transformSortedSetReply
		}),
		Wt
	);
}
var ro = {},
	pN;
function RU() {
	if (pN) return ro;
	((pN = 1), Object.defineProperty(ro, '__esModule', { value: !0 }));
	const e = L();
	return (
		(ro.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t, i) {
				(r.push('ZRANGEBYLEX'),
					r.pushKey(n),
					r.push((0, e.transformStringDoubleArgument)(u), (0, e.transformStringDoubleArgument)(t)),
					i?.LIMIT && r.push('LIMIT', i.LIMIT.offset.toString(), i.LIMIT.count.toString()));
			},
			transformReply: void 0
		}),
		ro
	);
}
var Zt = {},
	no = {},
	NN;
function sD() {
	if (NN) return no;
	((NN = 1), Object.defineProperty(no, '__esModule', { value: !0 }));
	const e = L();
	return (
		(no.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t, i) {
				(r.push('ZRANGEBYSCORE'),
					r.pushKey(n),
					r.push((0, e.transformStringDoubleArgument)(u), (0, e.transformStringDoubleArgument)(t)),
					i?.LIMIT && r.push('LIMIT', i.LIMIT.offset.toString(), i.LIMIT.count.toString()));
			},
			transformReply: void 0
		}),
		no
	);
}
var CN;
function hU() {
	if (CN) return Zt;
	CN = 1;
	var e =
		(Zt && Zt.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(Zt, '__esModule', { value: !0 });
	const r = L(),
		n = e(sD());
	return (
		(Zt.default = {
			CACHEABLE: n.default.CACHEABLE,
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				const t = u[0];
				(n.default.parseCommand(...u), t.push('WITHSCORES'));
			},
			transformReply: r.transformSortedSetReply
		}),
		Zt
	);
}
var uo = {},
	IN;
function SU() {
	if (IN) return uo;
	((IN = 1), Object.defineProperty(uo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(uo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i, a) {
				switch (
					(r.push('ZRANGESTORE'),
					r.pushKey(n),
					r.pushKey(u),
					r.push((0, e.transformStringDoubleArgument)(t), (0, e.transformStringDoubleArgument)(i)),
					a?.BY)
				) {
					case 'SCORE':
						r.push('BYSCORE');
						break;
					case 'LEX':
						r.push('BYLEX');
						break;
				}
				(a?.REV && r.push('REV'), a?.LIMIT && r.push('LIMIT', a.LIMIT.offset.toString(), a.LIMIT.count.toString()));
			},
			transformReply: void 0
		}),
		uo
	);
}
var io = {},
	LN;
function mU() {
	if (LN) return io;
	((LN = 1), Object.defineProperty(io, '__esModule', { value: !0 }));
	const e = L();
	return (
		(io.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('ZREMRANGEBYSCORE'), r.pushKey(n), r.push((0, e.transformStringDoubleArgument)(u), (0, e.transformStringDoubleArgument)(t)));
			},
			transformReply: void 0
		}),
		io
	);
}
var Jt = {},
	so = {},
	MN;
function aD() {
	return (
		MN ||
			((MN = 1),
			Object.defineProperty(so, '__esModule', { value: !0 }),
			(so.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('ZRANK'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		so
	);
}
var DN;
function OU() {
	if (DN) return Jt;
	DN = 1;
	var e =
		(Jt && Jt.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Jt, '__esModule', { value: !0 });
	const r = e(aD());
	return (
		(Jt.default = {
			CACHEABLE: r.default.CACHEABLE,
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				const u = n[0];
				(r.default.parseCommand(...n), u.push('WITHSCORE'));
			},
			transformReply: {
				2: (n) => (n === null ? null : { rank: n[0], score: Number(n[1]) }),
				3: (n) => (n === null ? null : { rank: n[0], score: n[1] })
			}
		}),
		Jt
	);
}
var ao = {},
	yN;
function TU() {
	return (
		yN ||
			((yN = 1),
			Object.defineProperty(ao, '__esModule', { value: !0 }),
			(ao.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('ZREM'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		ao
	);
}
var oo = {},
	PN;
function AU() {
	if (PN) return oo;
	((PN = 1), Object.defineProperty(oo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(oo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('ZREMRANGEBYLEX'), r.pushKey(n), r.push((0, e.transformStringDoubleArgument)(u), (0, e.transformStringDoubleArgument)(t)));
			},
			transformReply: void 0
		}),
		oo
	);
}
var fo = {},
	vN;
function pU() {
	return (
		vN ||
			((vN = 1),
			Object.defineProperty(fo, '__esModule', { value: !0 }),
			(fo.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('ZREMRANGEBYRANK'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		fo
	);
}
var lo = {},
	bN;
function NU() {
	return (
		bN ||
			((bN = 1),
			Object.defineProperty(lo, '__esModule', { value: !0 }),
			(lo.default = {
				CACHEABLE: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('ZREVRANK'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		lo
	);
}
var co = {},
	gN;
function CU() {
	if (gN) return co;
	((gN = 1), Object.defineProperty(co, '__esModule', { value: !0 }));
	const e = gd(),
		r = L();
	return (
		(co.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u, t, i) {
				(n.push('ZSCAN'), n.pushKey(u), (0, e.parseScanArguments)(n, t, i));
			},
			transformReply([n, u]) {
				return { cursor: n, members: r.transformSortedSetReply[2](u) };
			}
		}),
		co
	);
}
var _o = {},
	UN;
function IU() {
	if (UN) return _o;
	((UN = 1), Object.defineProperty(_o, '__esModule', { value: !0 }));
	const e = L();
	return (
		(_o.default = {
			CACHEABLE: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('ZSCORE'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformNullableDoubleReply
		}),
		_o
	);
}
var zt = {},
	Eo = {},
	GN;
function oD() {
	if (GN) return Eo;
	((GN = 1), Object.defineProperty(Eo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Eo.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('ZUNION'), (0, e.parseZKeysArguments)(r, n), u?.AGGREGATE && r.push('AGGREGATE', u.AGGREGATE));
			},
			transformReply: void 0
		}),
		Eo
	);
}
var YN;
function LU() {
	if (YN) return zt;
	YN = 1;
	var e =
		(zt && zt.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(zt, '__esModule', { value: !0 });
	const r = L(),
		n = e(oD());
	return (
		(zt.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				const t = u[0];
				(n.default.parseCommand(...u), t.push('WITHSCORES'));
			},
			transformReply: r.transformSortedSetReply
		}),
		zt
	);
}
var Ro = {},
	BN;
function MU() {
	if (BN) return Ro;
	((BN = 1), Object.defineProperty(Ro, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Ro.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('ZUNIONSTORE'), r.pushKey(n), (0, e.parseZKeysArguments)(r, u), t?.AGGREGATE && r.push('AGGREGATE', t.AGGREGATE));
			},
			transformReply: void 0
		}),
		Ro
	);
}
var ho = {},
	qN;
function DU() {
	if (qN) return ho;
	((qN = 1), Object.defineProperty(ho, '__esModule', { value: !0 }));
	const e = L();
	return (
		(ho.default = {
			parseCommand(r, n, u, t, i) {
				(r.push('VADD'), r.pushKey(n), i?.REDUCE !== void 0 && r.push('REDUCE', i.REDUCE.toString()), r.push('VALUES', u.length.toString()));
				for (const a of u) r.push((0, e.transformDoubleArgument)(a));
				(r.push(t),
					i?.CAS && r.push('CAS'),
					i?.QUANT && r.push(i.QUANT),
					i?.EF !== void 0 && r.push('EF', i.EF.toString()),
					i?.SETATTR && r.push('SETATTR', JSON.stringify(i.SETATTR)),
					i?.M !== void 0 && r.push('M', i.M.toString()));
			},
			transformReply: e.transformBooleanReply
		}),
		ho
	);
}
var So = {},
	HN;
function yU() {
	return (
		HN ||
			((HN = 1),
			Object.defineProperty(So, '__esModule', { value: !0 }),
			(So.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('VCARD'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		So
	);
}
var mo = {},
	jN;
function PU() {
	return (
		jN ||
			((jN = 1),
			Object.defineProperty(mo, '__esModule', { value: !0 }),
			(mo.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('VDIM'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		mo
	);
}
var Oo = {},
	FN;
function fD() {
	if (FN) return Oo;
	((FN = 1), Object.defineProperty(Oo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Oo.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('VEMB'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformDoubleArrayReply
		}),
		Oo
	);
}
var Qt = {},
	KN;
function vU() {
	if (KN) return Qt;
	KN = 1;
	var e =
		(Qt && Qt.__importDefault) ||
		function (t) {
			return t && t.__esModule ? t : { default: t };
		};
	Object.defineProperty(Qt, '__esModule', { value: !0 });
	const r = L(),
		n = e(fD()),
		u = {
			2: (t) => ({
				quantization: t[0],
				raw: t[1],
				l2Norm: r.transformDoubleReply[2](t[2]),
				...(t[3] !== void 0 && { quantizationRange: r.transformDoubleReply[2](t[3]) })
			}),
			3: (t) => ({ quantization: t[0], raw: t[1], l2Norm: t[2], quantizationRange: t[3] })
		};
	return (
		(Qt.default = {
			IS_READ_ONLY: !0,
			parseCommand(t, i, a) {
				(n.default.parseCommand(t, i, a), t.push('RAW'));
			},
			transformReply: u
		}),
		Qt
	);
}
var To = {},
	wN;
function bU() {
	if (wN) return To;
	((wN = 1), Object.defineProperty(To, '__esModule', { value: !0 }));
	const e = L();
	return (
		(To.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('VGETATTR'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformRedisJsonNullReply
		}),
		To
	);
}
var Ao = {},
	XN;
function gU() {
	return (
		XN ||
			((XN = 1),
			Object.defineProperty(Ao, '__esModule', { value: !0 }),
			(Ao.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('VINFO'), e.pushKey(r));
				},
				transformReply: {
					2: (e) => {
						const r = Object.create(null);
						for (let n = 0; n < e.length; n += 2) r[e[n].toString()] = e[n + 1];
						return r;
					},
					3: void 0
				}
			})),
		Ao
	);
}
var po = {},
	VN;
function dD() {
	return (
		VN ||
			((VN = 1),
			Object.defineProperty(po, '__esModule', { value: !0 }),
			(po.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('VLINKS'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		po
	);
}
var kt = {},
	WN;
function UU() {
	if (WN) return kt;
	WN = 1;
	var e =
		(kt && kt.__importDefault) ||
		function (t) {
			return t && t.__esModule ? t : { default: t };
		};
	Object.defineProperty(kt, '__esModule', { value: !0 });
	const r = L(),
		n = e(dD());
	function u(t) {
		const i = [];
		for (const a of t) {
			const s = Object.create(null);
			for (let o = 0; o < a.length; o += 2) {
				const f = a[o],
					d = r.transformDoubleReply[2](a[o + 1]);
				s[f.toString()] = d;
			}
			i.push(s);
		}
		return i;
	}
	return (
		(kt.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...t) {
				const i = t[0];
				(n.default.parseCommand(...t), i.push('WITHSCORES'));
			},
			transformReply: { 2: u, 3: void 0 }
		}),
		kt
	);
}
var No = {},
	xN;
function GU() {
	return (
		xN ||
			((xN = 1),
			Object.defineProperty(No, '__esModule', { value: !0 }),
			(No.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('VRANDMEMBER'), e.pushKey(r), n !== void 0 && e.push(n.toString()));
				},
				transformReply: void 0
			})),
		No
	);
}
var Co = {},
	ZN;
function YU() {
	if (ZN) return Co;
	((ZN = 1), Object.defineProperty(Co, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Co.default = {
			parseCommand(r, n, u) {
				(r.push('VREM'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		Co
	);
}
var Io = {},
	JN;
function BU() {
	if (JN) return Io;
	((JN = 1), Object.defineProperty(Io, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Io.default = {
			parseCommand(r, n, u, t) {
				(r.push('VSETATTR'), r.pushKey(n), r.push(u), typeof t == 'object' && t !== null ? r.push(JSON.stringify(t)) : r.push(t));
			},
			transformReply: e.transformBooleanReply
		}),
		Io
	);
}
var Lo = {},
	zN;
function lD() {
	if (zN) return Lo;
	((zN = 1), Object.defineProperty(Lo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Lo.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				if ((r.push('VSIM'), r.pushKey(n), Array.isArray(u))) {
					r.push('VALUES', u.length.toString());
					for (const i of u) r.push((0, e.transformDoubleArgument)(i));
				} else r.push('ELE', u);
				(t?.COUNT !== void 0 && r.push('COUNT', t.COUNT.toString()),
					t?.EPSILON !== void 0 && r.push('EPSILON', t.EPSILON.toString()),
					t?.EF !== void 0 && r.push('EF', t.EF.toString()),
					t?.FILTER && r.push('FILTER', t.FILTER),
					t?.['FILTER-EF'] !== void 0 && r.push('FILTER-EF', t['FILTER-EF'].toString()),
					t?.TRUTH && r.push('TRUTH'),
					t?.NOTHREAD && r.push('NOTHREAD'));
			},
			transformReply: void 0
		}),
		Lo
	);
}
var $t = {},
	QN;
function qU() {
	if (QN) return $t;
	QN = 1;
	var e =
		($t && $t.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty($t, '__esModule', { value: !0 });
	const r = L(),
		n = e(lD());
	return (
		($t.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				const t = u[0];
				(n.default.parseCommand(...u), t.push('WITHSCORES'));
			},
			transformReply: {
				2: (u) => {
					const t = u,
						i = {};
					for (let a = 0; a < t.length; a += 2) i[t[a].toString()] = r.transformDoubleReply[2](t[a + 1]);
					return i;
				},
				3: void 0
			}
		}),
		$t
	);
}
var Mo = {},
	kN;
function HU() {
	if (kN) return Mo;
	((kN = 1), Object.defineProperty(Mo, '__esModule', { value: !0 }));
	const e = L(),
		r = (n) => n;
	return (
		(Mo.default = {
			CACHEABLE: !1,
			IS_READ_ONLY: !0,
			parseCommand(n, ...u) {
				const t = ['LATENCY', 'HISTOGRAM'];
				(u.length !== 0 && t.push(...u), n.push(...t));
			},
			transformReply: {
				2: (n) => {
					const u = {};
					if (n.length === 0) return u;
					for (let t = 1; t < n.length; t += 2) {
						const i = n[t];
						u[n[t - 1]] = { calls: i[1], histogram_usec: (0, e.transformTuplesToMap)(i[3], r) };
					}
					return u;
				},
				3: void 0
			}
		}),
		Mo
	);
}
var $N;
function je() {
	return (
		$N ||
			(($N = 1),
			(function (e) {
				var r =
						(ee && ee.__createBinding) ||
						(Object.create
							? function (j, z, ue, ze) {
									ze === void 0 && (ze = ue);
									var nt = Object.getOwnPropertyDescriptor(z, ue);
									((!nt || ('get' in nt ? !z.__esModule : nt.writable || nt.configurable)) &&
										(nt = {
											enumerable: !0,
											get: function () {
												return z[ue];
											}
										}),
										Object.defineProperty(j, ze, nt));
								}
							: function (j, z, ue, ze) {
									(ze === void 0 && (ze = ue), (j[ze] = z[ue]));
								}),
					n =
						(ee && ee.__setModuleDefault) ||
						(Object.create
							? function (j, z) {
									Object.defineProperty(j, 'default', { enumerable: !0, value: z });
								}
							: function (j, z) {
									j.default = z;
								}),
					u =
						(ee && ee.__importStar) ||
						function (j) {
							if (j && j.__esModule) return j;
							var z = {};
							if (j != null) for (var ue in j) ue !== 'default' && Object.prototype.hasOwnProperty.call(j, ue) && r(z, j, ue);
							return (n(z, j), z);
						},
					t =
						(ee && ee.__importDefault) ||
						function (j) {
							return j && j.__esModule ? j : { default: j };
						};
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.REDIS_FLUSH_MODES = e.COMMAND_LIST_FILTER_BY = e.CLUSTER_SLOT_STATES = e.FAILOVER_MODES = e.CLIENT_KILL_FILTERS = void 0));
				const i = t(KD()),
					a = t(wD()),
					s = t(XD()),
					o = t(VD()),
					f = t(WD()),
					d = t(xD()),
					_ = t(ZD()),
					c = t(JD()),
					R = t(bM()),
					h = t(zD()),
					S = t(QD()),
					O = t(kD()),
					l = t($D()),
					E = t(ey()),
					T = t(gM()),
					I = t(ty()),
					P = t(ry()),
					D = t(ny()),
					m = t(uy()),
					A = t(iy()),
					N = t(sy()),
					C = t(ay()),
					y = t(oy()),
					b = t(fy()),
					U = t(dy()),
					B = t(GM()),
					X = t(ly()),
					x = t(cy()),
					ne = t(_y()),
					q = t(BM()),
					V = t(Ey()),
					F = t(Ry()),
					Q = t(hy()),
					k = t(Sy()),
					tn = t(my()),
					p = t(qM()),
					M = u(Oy());
				Object.defineProperty(e, 'CLIENT_KILL_FILTERS', {
					enumerable: !0,
					get: function () {
						return M.CLIENT_KILL_FILTERS;
					}
				});
				const v = t(Ty()),
					G = t(Ay()),
					Y = t(py()),
					H = t(Ny()),
					Z = t(Cy()),
					dl = t(Iy()),
					ll = t(Ly()),
					cl = t(My()),
					_l = t(Dy()),
					El = t(yy()),
					Rl = t(Py()),
					hl = t(vy()),
					Sl = t(by()),
					ml = t(gy()),
					Ol = t(Uy()),
					qd = u(Gy());
				Object.defineProperty(e, 'FAILOVER_MODES', {
					enumerable: !0,
					get: function () {
						return qd.FAILOVER_MODES;
					}
				});
				const Tl = t(Yy()),
					Al = t(By()),
					pl = t(qy()),
					Nl = t(Hy()),
					Cl = t(jy()),
					Il = t(Fy()),
					Ll = t(Ky()),
					Ml = t(wy()),
					Dl = t(Xy()),
					yl = t(Vy()),
					Pl = t(Wy()),
					vl = t(xy()),
					bl = t(Zy()),
					gl = t(Jy()),
					Ul = t(zy()),
					Hd = u(Qy());
				Object.defineProperty(e, 'CLUSTER_SLOT_STATES', {
					enumerable: !0,
					get: function () {
						return Hd.CLUSTER_SLOT_STATES;
					}
				});
				const Gl = t(ky()),
					Yl = t($y()),
					Bl = t(eP()),
					ql = t(tP()),
					Hl = t(rP()),
					jd = u(nP());
				Object.defineProperty(e, 'COMMAND_LIST_FILTER_BY', {
					enumerable: !0,
					get: function () {
						return jd.COMMAND_LIST_FILTER_BY;
					}
				});
				const jl = t(uP()),
					Fl = t(iP()),
					Kl = t(sP()),
					wl = t(aP()),
					Xl = t(oP()),
					Vl = t(fP()),
					Wl = t(dP()),
					xl = t(lP()),
					Zl = t(cP()),
					Jl = t(_P()),
					zl = t(EP()),
					Ql = t(RP()),
					kl = t(hP()),
					$l = t(SP()),
					ec = t(mP()),
					tc = t(Ur()),
					rc = t(OP()),
					nc = t(TP()),
					uc = t(AP()),
					ic = t(pP()),
					sc = t(NP()),
					ac = t(CP()),
					oc = t(IP()),
					fc = t(LP()),
					dc = t(MP()),
					lc = t($d()),
					cc = t(Pd()),
					_c = t(DP()),
					Ec = t(yP()),
					Rc = t(PP()),
					hc = t(HM()),
					Sc = t(bd()),
					mc = t(vd()),
					Oc = t(Gr()),
					Tc = t(vP()),
					Ac = t(bP()),
					pc = t(gP()),
					Nc = t(UP()),
					Cc = t(GP()),
					Ic = t(YP()),
					Lc = t(BP()),
					Mc = t(qP()),
					Dc = t(HP()),
					yc = t(jP()),
					Pc = t(FP()),
					Fd = u(KP());
				Object.defineProperty(e, 'REDIS_FLUSH_MODES', {
					enumerable: !0,
					get: function () {
						return Fd.REDIS_FLUSH_MODES;
					}
				});
				const vc = t(wP()),
					bc = t(XP()),
					gc = t(VP()),
					Uc = t(WP()),
					Gc = t(xP()),
					Yc = t(ZP()),
					Bc = t(JP()),
					qc = t(zP()),
					Hc = t(jM()),
					jc = t(QP()),
					Fc = t(kP()),
					Kc = t($P()),
					wc = t(ev()),
					Xc = t(FM()),
					Vc = t(tv()),
					Wc = t(rv()),
					xc = t(nv()),
					Zc = t(uv()),
					Jc = t(iv()),
					zc = t(sv()),
					Qc = t(av()),
					kc = t(ov()),
					$c = t(fv()),
					e_ = t(dv()),
					t_ = t(lv()),
					r_ = t(cv()),
					n_ = t(_v()),
					u_ = t(Ev()),
					i_ = t(Rv()),
					s_ = t(hv()),
					a_ = t(Sv()),
					o_ = t(mv()),
					f_ = t(Ov()),
					d_ = t(Tv()),
					l_ = t(Av()),
					c_ = t(KM()),
					__ = t(pv()),
					E_ = t(Nv()),
					R_ = t(Cv()),
					h_ = t(Iv()),
					S_ = t(Lv()),
					m_ = t(Mv()),
					O_ = t(Dv()),
					T_ = t(yv()),
					A_ = t(Pv()),
					p_ = t(vv()),
					N_ = t(bv()),
					C_ = t(gv()),
					I_ = t(Uv()),
					L_ = t(Gv()),
					M_ = t(wM()),
					D_ = t(Yv()),
					y_ = t(Bv()),
					P_ = t(qv()),
					v_ = t(Hv()),
					b_ = t(XM()),
					g_ = t(jv()),
					U_ = t(rl()),
					G_ = t(Fv()),
					Y_ = t(Kv()),
					B_ = t(wv()),
					q_ = t(Xv()),
					H_ = t(UM()),
					yD = t(Vv()),
					j_ = t(Wv()),
					F_ = t(VM()),
					K_ = t(xv()),
					w_ = t(WM()),
					X_ = t(Zv()),
					V_ = t(Jv()),
					W_ = t(zv()),
					x_ = t(Qv()),
					Z_ = t(kv()),
					J_ = t($v()),
					z_ = t(eb()),
					Q_ = t(tb()),
					k_ = t(rb()),
					$_ = t(nb()),
					eE = t(ub()),
					tE = t(ib()),
					rE = t(sb()),
					nE = t(ab()),
					uE = t(ob()),
					iE = t(fb()),
					sE = t(db()),
					aE = t(xM()),
					oE = t(lb()),
					fE = t(cb()),
					dE = t(_b()),
					lE = t(Eb()),
					cE = t(Rb()),
					_E = t(hb()),
					EE = t(Sb()),
					RE = t(mb()),
					hE = t(Ob()),
					SE = t(Tb()),
					mE = t(Ab()),
					OE = t(pb()),
					TE = t(Nb()),
					AE = t(Cb()),
					pE = t(Ib()),
					NE = t(Lb()),
					CE = t(Mb()),
					IE = t(Db()),
					LE = t(yb()),
					ME = t(Pb()),
					DE = t(vb()),
					yE = t(bb()),
					PE = t(gb()),
					vE = t(Ub()),
					bE = t(Gb()),
					gE = t(Yb()),
					UE = t(Bb()),
					GE = t(qb()),
					YE = t(Hb()),
					BE = t(jb()),
					qE = t(Fb()),
					HE = t(Kb()),
					jE = t(wb()),
					FE = t(Xb()),
					KE = t(Vb()),
					wE = t(Wb()),
					XE = t(gd()),
					VE = t(xb()),
					WE = t(Zb()),
					xE = t(Jb()),
					ZE = t(zb()),
					JE = t(Qb()),
					zE = t(kb()),
					QE = t($b()),
					kE = t(eg()),
					$E = t(tg()),
					eR = t(rg()),
					tR = t(ng()),
					rR = t(ug()),
					nR = t(ig()),
					uR = t(sg()),
					iR = t(ag()),
					sR = t(og()),
					aR = t(fg()),
					oR = t(dg()),
					fR = t(lg()),
					dR = t(cg()),
					lR = t(_g()),
					cR = t(Eg()),
					_R = t(nl()),
					ER = t(Rg()),
					RR = t(hg()),
					hR = t(Sg()),
					SR = t(mg()),
					mR = t(ZM()),
					OR = t(Og()),
					TR = t(Tg()),
					AR = t(Ag()),
					pR = t(pg()),
					NR = t(Ng()),
					CR = t(Cg()),
					IR = t(Ig()),
					LR = t(Lg()),
					MR = t(Mg()),
					DR = t(Dg()),
					yR = t(yg()),
					PR = t(Pg()),
					vR = t(vg()),
					bR = t(bg()),
					gR = t(gg()),
					UR = t(JM()),
					GR = t(Ug()),
					YR = t(zM()),
					BR = t(Gg()),
					qR = t(QM()),
					HR = t(Yg()),
					jR = t(Bg()),
					FR = t(qg()),
					KR = t(Hg()),
					wR = t(jg()),
					XR = t(Fg()),
					VR = t(Kg()),
					WR = t(wg()),
					xR = t(Xg()),
					ZR = t(Vg()),
					JR = t(Wg()),
					zR = t(xg()),
					QR = t(Zg()),
					kR = t(kM()),
					$R = t($M()),
					eh = t(Jg()),
					th = t(zg()),
					rh = t(Qg()),
					nh = t(kg()),
					uh = t($g()),
					ih = t(eD()),
					sh = t(eU()),
					ah = t(tU()),
					oh = t(rU()),
					fh = t(tD()),
					dh = t(nU()),
					lh = t(uU()),
					ch = t(iU()),
					_h = t(ul()),
					Eh = t(sU()),
					Rh = t(aU()),
					hh = t(oU()),
					Sh = t(YM()),
					mh = t(fU()),
					Oh = t(dU()),
					Th = t(rD()),
					Ah = t(lU()),
					ph = t(cU()),
					Nh = t(_U()),
					Ch = t(uD()),
					Ih = t(nD()),
					Lh = t(EU()),
					Mh = t(iD()),
					Dh = t(RU()),
					yh = t(hU()),
					Ph = t(sD()),
					vh = t(SU()),
					bh = t(mU()),
					gh = t(OU()),
					Uh = t(aD()),
					Gh = t(TU()),
					Yh = t(AU()),
					Bh = t(pU()),
					qh = t(NU()),
					Hh = t(CU()),
					jh = t(IU()),
					Fh = t(LU()),
					Kh = t(oD()),
					wh = t(MU()),
					Xh = t(DU()),
					Vh = t(yU()),
					Wh = t(PU()),
					xh = t(fD()),
					Zh = t(vU()),
					Jh = t(bU()),
					zh = t(gU()),
					Qh = t(dD()),
					kh = t(UU()),
					$h = t(GU()),
					eS = t(YU()),
					tS = t(BU()),
					rS = t(lD()),
					nS = t(qU()),
					uS = t(HU());
				e.default = {
					ACL_CAT: i.default,
					aclCat: i.default,
					ACL_DELUSER: a.default,
					aclDelUser: a.default,
					ACL_DRYRUN: s.default,
					aclDryRun: s.default,
					ACL_GENPASS: o.default,
					aclGenPass: o.default,
					ACL_GETUSER: f.default,
					aclGetUser: f.default,
					ACL_LIST: d.default,
					aclList: d.default,
					ACL_LOAD: _.default,
					aclLoad: _.default,
					ACL_LOG_RESET: c.default,
					aclLogReset: c.default,
					ACL_LOG: R.default,
					aclLog: R.default,
					ACL_SAVE: h.default,
					aclSave: h.default,
					ACL_SETUSER: S.default,
					aclSetUser: S.default,
					ACL_USERS: O.default,
					aclUsers: O.default,
					ACL_WHOAMI: l.default,
					aclWhoAmI: l.default,
					APPEND: E.default,
					append: E.default,
					ASKING: T.default,
					asking: T.default,
					AUTH: I.default,
					auth: I.default,
					BGREWRITEAOF: P.default,
					bgRewriteAof: P.default,
					BGSAVE: D.default,
					bgSave: D.default,
					BITCOUNT: m.default,
					bitCount: m.default,
					BITFIELD_RO: A.default,
					bitFieldRo: A.default,
					BITFIELD: N.default,
					bitField: N.default,
					BITOP: C.default,
					bitOp: C.default,
					BITPOS: y.default,
					bitPos: y.default,
					BLMOVE: b.default,
					blMove: b.default,
					BLMPOP: U.default,
					blmPop: U.default,
					BLPOP: B.default,
					blPop: B.default,
					BRPOP: X.default,
					brPop: X.default,
					BRPOPLPUSH: x.default,
					brPopLPush: x.default,
					BZMPOP: ne.default,
					bzmPop: ne.default,
					BZPOPMAX: q.default,
					bzPopMax: q.default,
					BZPOPMIN: V.default,
					bzPopMin: V.default,
					CLIENT_CACHING: F.default,
					clientCaching: F.default,
					CLIENT_GETNAME: Q.default,
					clientGetName: Q.default,
					CLIENT_GETREDIR: k.default,
					clientGetRedir: k.default,
					CLIENT_ID: tn.default,
					clientId: tn.default,
					CLIENT_INFO: p.default,
					clientInfo: p.default,
					CLIENT_KILL: M.default,
					clientKill: M.default,
					CLIENT_LIST: v.default,
					clientList: v.default,
					'CLIENT_NO-EVICT': G.default,
					clientNoEvict: G.default,
					'CLIENT_NO-TOUCH': Y.default,
					clientNoTouch: Y.default,
					CLIENT_PAUSE: H.default,
					clientPause: H.default,
					CLIENT_SETNAME: Z.default,
					clientSetName: Z.default,
					CLIENT_TRACKING: dl.default,
					clientTracking: dl.default,
					CLIENT_TRACKINGINFO: ll.default,
					clientTrackingInfo: ll.default,
					CLIENT_UNPAUSE: cl.default,
					clientUnpause: cl.default,
					CLUSTER_ADDSLOTS: _l.default,
					clusterAddSlots: _l.default,
					CLUSTER_ADDSLOTSRANGE: El.default,
					clusterAddSlotsRange: El.default,
					CLUSTER_BUMPEPOCH: Rl.default,
					clusterBumpEpoch: Rl.default,
					'CLUSTER_COUNT-FAILURE-REPORTS': hl.default,
					clusterCountFailureReports: hl.default,
					CLUSTER_COUNTKEYSINSLOT: Sl.default,
					clusterCountKeysInSlot: Sl.default,
					CLUSTER_DELSLOTS: ml.default,
					clusterDelSlots: ml.default,
					CLUSTER_DELSLOTSRANGE: Ol.default,
					clusterDelSlotsRange: Ol.default,
					CLUSTER_FAILOVER: qd.default,
					clusterFailover: qd.default,
					CLUSTER_FLUSHSLOTS: Tl.default,
					clusterFlushSlots: Tl.default,
					CLUSTER_FORGET: Al.default,
					clusterForget: Al.default,
					CLUSTER_GETKEYSINSLOT: pl.default,
					clusterGetKeysInSlot: pl.default,
					CLUSTER_INFO: Nl.default,
					clusterInfo: Nl.default,
					CLUSTER_KEYSLOT: Cl.default,
					clusterKeySlot: Cl.default,
					CLUSTER_LINKS: Il.default,
					clusterLinks: Il.default,
					CLUSTER_MEET: Ll.default,
					clusterMeet: Ll.default,
					CLUSTER_MYID: Ml.default,
					clusterMyId: Ml.default,
					CLUSTER_MYSHARDID: Dl.default,
					clusterMyShardId: Dl.default,
					CLUSTER_NODES: yl.default,
					clusterNodes: yl.default,
					CLUSTER_REPLICAS: Pl.default,
					clusterReplicas: Pl.default,
					CLUSTER_REPLICATE: vl.default,
					clusterReplicate: vl.default,
					CLUSTER_RESET: bl.default,
					clusterReset: bl.default,
					CLUSTER_SAVECONFIG: gl.default,
					clusterSaveConfig: gl.default,
					'CLUSTER_SET-CONFIG-EPOCH': Ul.default,
					clusterSetConfigEpoch: Ul.default,
					CLUSTER_SETSLOT: Hd.default,
					clusterSetSlot: Hd.default,
					CLUSTER_SLOTS: Gl.default,
					clusterSlots: Gl.default,
					COMMAND_COUNT: Yl.default,
					commandCount: Yl.default,
					COMMAND_GETKEYS: Bl.default,
					commandGetKeys: Bl.default,
					COMMAND_GETKEYSANDFLAGS: ql.default,
					commandGetKeysAndFlags: ql.default,
					COMMAND_INFO: Hl.default,
					commandInfo: Hl.default,
					COMMAND_LIST: jd.default,
					commandList: jd.default,
					COMMAND: jl.default,
					command: jl.default,
					CONFIG_GET: Fl.default,
					configGet: Fl.default,
					CONFIG_RESETASTAT: Kl.default,
					configResetStat: Kl.default,
					CONFIG_REWRITE: wl.default,
					configRewrite: wl.default,
					CONFIG_SET: Xl.default,
					configSet: Xl.default,
					COPY: Vl.default,
					copy: Vl.default,
					DBSIZE: Wl.default,
					dbSize: Wl.default,
					DECR: xl.default,
					decr: xl.default,
					DECRBY: Zl.default,
					decrBy: Zl.default,
					DEL: Jl.default,
					del: Jl.default,
					DELEX: zl.default,
					delEx: zl.default,
					DIGEST: Ql.default,
					digest: Ql.default,
					DUMP: kl.default,
					dump: kl.default,
					ECHO: $l.default,
					echo: $l.default,
					EVAL_RO: ec.default,
					evalRo: ec.default,
					EVAL: tc.default,
					eval: tc.default,
					EVALSHA_RO: rc.default,
					evalShaRo: rc.default,
					EVALSHA: nc.default,
					evalSha: nc.default,
					EXISTS: Mc.default,
					exists: Mc.default,
					EXPIRE: Dc.default,
					expire: Dc.default,
					EXPIREAT: yc.default,
					expireAt: yc.default,
					EXPIRETIME: Pc.default,
					expireTime: Pc.default,
					FLUSHALL: Fd.default,
					flushAll: Fd.default,
					FLUSHDB: vc.default,
					flushDb: vc.default,
					FCALL: bc.default,
					fCall: bc.default,
					FCALL_RO: gc.default,
					fCallRo: gc.default,
					FUNCTION_DELETE: Uc.default,
					functionDelete: Uc.default,
					FUNCTION_DUMP: Gc.default,
					functionDump: Gc.default,
					FUNCTION_FLUSH: Yc.default,
					functionFlush: Yc.default,
					FUNCTION_KILL: Bc.default,
					functionKill: Bc.default,
					FUNCTION_LIST_WITHCODE: qc.default,
					functionListWithCode: qc.default,
					FUNCTION_LIST: Hc.default,
					functionList: Hc.default,
					FUNCTION_LOAD: jc.default,
					functionLoad: jc.default,
					FUNCTION_RESTORE: Fc.default,
					functionRestore: Fc.default,
					FUNCTION_STATS: Kc.default,
					functionStats: Kc.default,
					GEOADD: uc.default,
					geoAdd: uc.default,
					GEODIST: ic.default,
					geoDist: ic.default,
					GEOHASH: sc.default,
					geoHash: sc.default,
					GEOPOS: ac.default,
					geoPos: ac.default,
					GEORADIUS_RO_WITH: oc.default,
					geoRadiusRoWith: oc.default,
					GEORADIUS_RO: fc.default,
					geoRadiusRo: fc.default,
					GEORADIUS_STORE: dc.default,
					geoRadiusStore: dc.default,
					GEORADIUS_WITH: lc.default,
					geoRadiusWith: lc.default,
					GEORADIUS: cc.default,
					geoRadius: cc.default,
					GEORADIUSBYMEMBER_RO_WITH: _c.default,
					geoRadiusByMemberRoWith: _c.default,
					GEORADIUSBYMEMBER_RO: Ec.default,
					geoRadiusByMemberRo: Ec.default,
					GEORADIUSBYMEMBER_STORE: Rc.default,
					geoRadiusByMemberStore: Rc.default,
					GEORADIUSBYMEMBER_WITH: hc.default,
					geoRadiusByMemberWith: hc.default,
					GEORADIUSBYMEMBER: Sc.default,
					geoRadiusByMember: Sc.default,
					GEOSEARCH_WITH: mc.default,
					geoSearchWith: mc.default,
					GEOSEARCH: Oc.default,
					geoSearch: Oc.default,
					GEOSEARCHSTORE: Tc.default,
					geoSearchStore: Tc.default,
					GET: Ac.default,
					get: Ac.default,
					GETBIT: pc.default,
					getBit: pc.default,
					GETDEL: Nc.default,
					getDel: Nc.default,
					GETEX: Cc.default,
					getEx: Cc.default,
					GETRANGE: Ic.default,
					getRange: Ic.default,
					GETSET: Lc.default,
					getSet: Lc.default,
					HDEL: wc.default,
					hDel: wc.default,
					HELLO: Xc.default,
					hello: Xc.default,
					HEXISTS: Vc.default,
					hExists: Vc.default,
					HEXPIRE: Wc.default,
					hExpire: Wc.default,
					HEXPIREAT: xc.default,
					hExpireAt: xc.default,
					HEXPIRETIME: Zc.default,
					hExpireTime: Zc.default,
					HGET: Jc.default,
					hGet: Jc.default,
					HGETALL: zc.default,
					hGetAll: zc.default,
					HGETDEL: Qc.default,
					hGetDel: Qc.default,
					HGETEX: kc.default,
					hGetEx: kc.default,
					HINCRBY: $c.default,
					hIncrBy: $c.default,
					HINCRBYFLOAT: e_.default,
					hIncrByFloat: e_.default,
					HKEYS: t_.default,
					hKeys: t_.default,
					HLEN: r_.default,
					hLen: r_.default,
					HMGET: n_.default,
					hmGet: n_.default,
					HPERSIST: u_.default,
					hPersist: u_.default,
					HPEXPIRE: i_.default,
					hpExpire: i_.default,
					HPEXPIREAT: s_.default,
					hpExpireAt: s_.default,
					HPEXPIRETIME: a_.default,
					hpExpireTime: a_.default,
					HPTTL: o_.default,
					hpTTL: o_.default,
					HRANDFIELD_COUNT_WITHVALUES: f_.default,
					hRandFieldCountWithValues: f_.default,
					HRANDFIELD_COUNT: d_.default,
					hRandFieldCount: d_.default,
					HRANDFIELD: l_.default,
					hRandField: l_.default,
					HSCAN: c_.default,
					hScan: c_.default,
					HSCAN_NOVALUES: __.default,
					hScanNoValues: __.default,
					HSET: E_.default,
					hSet: E_.default,
					HSETEX: R_.default,
					hSetEx: R_.default,
					HSETNX: h_.default,
					hSetNX: h_.default,
					HSTRLEN: S_.default,
					hStrLen: S_.default,
					HTTL: m_.default,
					hTTL: m_.default,
					HVALS: O_.default,
					hVals: O_.default,
					INCR: T_.default,
					incr: T_.default,
					INCRBY: A_.default,
					incrBy: A_.default,
					INCRBYFLOAT: p_.default,
					incrByFloat: p_.default,
					INFO: N_.default,
					info: N_.default,
					KEYS: C_.default,
					keys: C_.default,
					LASTSAVE: I_.default,
					lastSave: I_.default,
					LATENCY_DOCTOR: L_.default,
					latencyDoctor: L_.default,
					LATENCY_GRAPH: M_.default,
					latencyGraph: M_.default,
					LATENCY_HISTORY: D_.default,
					latencyHistory: D_.default,
					LATENCY_HISTOGRAM: uS.default,
					latencyHistogram: uS.default,
					LATENCY_LATEST: y_.default,
					latencyLatest: y_.default,
					LATENCY_RESET: P_.default,
					latencyReset: P_.default,
					LCS_IDX_WITHMATCHLEN: v_.default,
					lcsIdxWithMatchLen: v_.default,
					LCS_IDX: b_.default,
					lcsIdx: b_.default,
					LCS_LEN: g_.default,
					lcsLen: g_.default,
					LCS: U_.default,
					lcs: U_.default,
					LINDEX: G_.default,
					lIndex: G_.default,
					LINSERT: Y_.default,
					lInsert: Y_.default,
					LLEN: B_.default,
					lLen: B_.default,
					LMOVE: q_.default,
					lMove: q_.default,
					LMPOP: H_.default,
					lmPop: H_.default,
					LOLWUT: yD.default,
					LPOP_COUNT: j_.default,
					lPopCount: j_.default,
					LPOP: F_.default,
					lPop: F_.default,
					LPOS_COUNT: K_.default,
					lPosCount: K_.default,
					LPOS: w_.default,
					lPos: w_.default,
					LPUSH: X_.default,
					lPush: X_.default,
					LPUSHX: V_.default,
					lPushX: V_.default,
					LRANGE: W_.default,
					lRange: W_.default,
					LREM: x_.default,
					lRem: x_.default,
					LSET: Z_.default,
					lSet: Z_.default,
					LTRIM: J_.default,
					lTrim: J_.default,
					MEMORY_DOCTOR: z_.default,
					memoryDoctor: z_.default,
					'MEMORY_MALLOC-STATS': Q_.default,
					memoryMallocStats: Q_.default,
					MEMORY_PURGE: k_.default,
					memoryPurge: k_.default,
					MEMORY_STATS: $_.default,
					memoryStats: $_.default,
					MEMORY_USAGE: eE.default,
					memoryUsage: eE.default,
					MGET: tE.default,
					mGet: tE.default,
					MIGRATE: rE.default,
					migrate: rE.default,
					MODULE_LIST: nE.default,
					moduleList: nE.default,
					MODULE_LOAD: uE.default,
					moduleLoad: uE.default,
					MODULE_UNLOAD: iE.default,
					moduleUnload: iE.default,
					MOVE: sE.default,
					move: sE.default,
					MSET: aE.default,
					mSet: aE.default,
					MSETEX: oE.default,
					mSetEx: oE.default,
					MSETNX: fE.default,
					mSetNX: fE.default,
					OBJECT_ENCODING: dE.default,
					objectEncoding: dE.default,
					OBJECT_FREQ: lE.default,
					objectFreq: lE.default,
					OBJECT_IDLETIME: cE.default,
					objectIdleTime: cE.default,
					OBJECT_REFCOUNT: _E.default,
					objectRefCount: _E.default,
					PERSIST: EE.default,
					persist: EE.default,
					PEXPIRE: RE.default,
					pExpire: RE.default,
					PEXPIREAT: hE.default,
					pExpireAt: hE.default,
					PEXPIRETIME: SE.default,
					pExpireTime: SE.default,
					PFADD: mE.default,
					pfAdd: mE.default,
					PFCOUNT: OE.default,
					pfCount: OE.default,
					PFMERGE: TE.default,
					pfMerge: TE.default,
					PING: AE.default,
					ping: AE.default,
					PSETEX: pE.default,
					pSetEx: pE.default,
					PTTL: NE.default,
					pTTL: NE.default,
					PUBLISH: CE.default,
					publish: CE.default,
					PUBSUB_CHANNELS: IE.default,
					pubSubChannels: IE.default,
					PUBSUB_NUMPAT: LE.default,
					pubSubNumPat: LE.default,
					PUBSUB_NUMSUB: ME.default,
					pubSubNumSub: ME.default,
					PUBSUB_SHARDNUMSUB: DE.default,
					pubSubShardNumSub: DE.default,
					PUBSUB_SHARDCHANNELS: yE.default,
					pubSubShardChannels: yE.default,
					RANDOMKEY: PE.default,
					randomKey: PE.default,
					READONLY: vE.default,
					readonly: vE.default,
					RENAME: bE.default,
					rename: bE.default,
					RENAMENX: gE.default,
					renameNX: gE.default,
					REPLICAOF: UE.default,
					replicaOf: UE.default,
					'RESTORE-ASKING': GE.default,
					restoreAsking: GE.default,
					RESTORE: YE.default,
					restore: YE.default,
					RPOP_COUNT: qE.default,
					rPopCount: qE.default,
					ROLE: BE.default,
					role: BE.default,
					RPOP: HE.default,
					rPop: HE.default,
					RPOPLPUSH: jE.default,
					rPopLPush: jE.default,
					RPUSH: FE.default,
					rPush: FE.default,
					RPUSHX: KE.default,
					rPushX: KE.default,
					SADD: wE.default,
					sAdd: wE.default,
					SCAN: XE.default,
					scan: XE.default,
					SCARD: VE.default,
					sCard: VE.default,
					SCRIPT_DEBUG: WE.default,
					scriptDebug: WE.default,
					SCRIPT_EXISTS: xE.default,
					scriptExists: xE.default,
					SCRIPT_FLUSH: ZE.default,
					scriptFlush: ZE.default,
					SCRIPT_KILL: JE.default,
					scriptKill: JE.default,
					SCRIPT_LOAD: zE.default,
					scriptLoad: zE.default,
					SDIFF: QE.default,
					sDiff: QE.default,
					SDIFFSTORE: kE.default,
					sDiffStore: kE.default,
					SET: $E.default,
					set: $E.default,
					SETBIT: eR.default,
					setBit: eR.default,
					SETEX: tR.default,
					setEx: tR.default,
					SETNX: rR.default,
					setNX: rR.default,
					SETRANGE: nR.default,
					setRange: nR.default,
					SINTER: uR.default,
					sInter: uR.default,
					SINTERCARD: iR.default,
					sInterCard: iR.default,
					SINTERSTORE: sR.default,
					sInterStore: sR.default,
					SISMEMBER: aR.default,
					sIsMember: aR.default,
					SMEMBERS: oR.default,
					sMembers: oR.default,
					SMISMEMBER: fR.default,
					smIsMember: fR.default,
					SMOVE: dR.default,
					sMove: dR.default,
					SORT_RO: lR.default,
					sortRo: lR.default,
					SORT_STORE: cR.default,
					sortStore: cR.default,
					SORT: _R.default,
					sort: _R.default,
					SPOP_COUNT: ER.default,
					sPopCount: ER.default,
					SPOP: RR.default,
					sPop: RR.default,
					SPUBLISH: hR.default,
					sPublish: hR.default,
					SRANDMEMBER_COUNT: SR.default,
					sRandMemberCount: SR.default,
					SRANDMEMBER: mR.default,
					sRandMember: mR.default,
					SREM: OR.default,
					sRem: OR.default,
					SSCAN: TR.default,
					sScan: TR.default,
					STRLEN: AR.default,
					strLen: AR.default,
					SUNION: pR.default,
					sUnion: pR.default,
					SUNIONSTORE: NR.default,
					sUnionStore: NR.default,
					SWAPDB: CR.default,
					swapDb: CR.default,
					TIME: IR.default,
					time: IR.default,
					TOUCH: LR.default,
					touch: LR.default,
					TTL: MR.default,
					ttl: MR.default,
					TYPE: DR.default,
					type: DR.default,
					UNLINK: yR.default,
					unlink: yR.default,
					WAIT: PR.default,
					wait: PR.default,
					XACK: vR.default,
					xAck: vR.default,
					XACKDEL: bR.default,
					xAckDel: bR.default,
					XADD_NOMKSTREAM: gR.default,
					xAddNoMkStream: gR.default,
					XADD: UR.default,
					xAdd: UR.default,
					XAUTOCLAIM_JUSTID: GR.default,
					xAutoClaimJustId: GR.default,
					XAUTOCLAIM: YR.default,
					xAutoClaim: YR.default,
					XCLAIM_JUSTID: BR.default,
					xClaimJustId: BR.default,
					XCLAIM: qR.default,
					xClaim: qR.default,
					XDEL: HR.default,
					xDel: HR.default,
					XDELEX: jR.default,
					xDelEx: jR.default,
					XGROUP_CREATE: FR.default,
					xGroupCreate: FR.default,
					XGROUP_CREATECONSUMER: KR.default,
					xGroupCreateConsumer: KR.default,
					XGROUP_DELCONSUMER: wR.default,
					xGroupDelConsumer: wR.default,
					XGROUP_DESTROY: XR.default,
					xGroupDestroy: XR.default,
					XGROUP_SETID: VR.default,
					xGroupSetId: VR.default,
					XINFO_CONSUMERS: WR.default,
					xInfoConsumers: WR.default,
					XINFO_GROUPS: xR.default,
					xInfoGroups: xR.default,
					XINFO_STREAM: ZR.default,
					xInfoStream: ZR.default,
					XLEN: JR.default,
					xLen: JR.default,
					XPENDING_RANGE: zR.default,
					xPendingRange: zR.default,
					XPENDING: QR.default,
					xPending: QR.default,
					XRANGE: kR.default,
					xRange: kR.default,
					XREAD: $R.default,
					xRead: $R.default,
					XREADGROUP: eh.default,
					xReadGroup: eh.default,
					XREVRANGE: th.default,
					xRevRange: th.default,
					XSETID: rh.default,
					xSetId: rh.default,
					XTRIM: nh.default,
					xTrim: nh.default,
					ZADD_INCR: uh.default,
					zAddIncr: uh.default,
					ZADD: ih.default,
					zAdd: ih.default,
					ZCARD: sh.default,
					zCard: sh.default,
					ZCOUNT: ah.default,
					zCount: ah.default,
					ZDIFF_WITHSCORES: oh.default,
					zDiffWithScores: oh.default,
					ZDIFF: fh.default,
					zDiff: fh.default,
					ZDIFFSTORE: dh.default,
					zDiffStore: dh.default,
					ZINCRBY: lh.default,
					zIncrBy: lh.default,
					ZINTER_WITHSCORES: ch.default,
					zInterWithScores: ch.default,
					ZINTER: _h.default,
					zInter: _h.default,
					ZINTERCARD: Eh.default,
					zInterCard: Eh.default,
					ZINTERSTORE: Rh.default,
					zInterStore: Rh.default,
					ZLEXCOUNT: hh.default,
					zLexCount: hh.default,
					ZMPOP: Sh.default,
					zmPop: Sh.default,
					ZMSCORE: mh.default,
					zmScore: mh.default,
					ZPOPMAX_COUNT: Oh.default,
					zPopMaxCount: Oh.default,
					ZPOPMAX: Th.default,
					zPopMax: Th.default,
					ZPOPMIN_COUNT: Ah.default,
					zPopMinCount: Ah.default,
					ZPOPMIN: ph.default,
					zPopMin: ph.default,
					ZRANDMEMBER_COUNT_WITHSCORES: Nh.default,
					zRandMemberCountWithScores: Nh.default,
					ZRANDMEMBER_COUNT: Ch.default,
					zRandMemberCount: Ch.default,
					ZRANDMEMBER: Ih.default,
					zRandMember: Ih.default,
					ZRANGE_WITHSCORES: Lh.default,
					zRangeWithScores: Lh.default,
					ZRANGE: Mh.default,
					zRange: Mh.default,
					ZRANGEBYLEX: Dh.default,
					zRangeByLex: Dh.default,
					ZRANGEBYSCORE_WITHSCORES: yh.default,
					zRangeByScoreWithScores: yh.default,
					ZRANGEBYSCORE: Ph.default,
					zRangeByScore: Ph.default,
					ZRANGESTORE: vh.default,
					zRangeStore: vh.default,
					ZRANK_WITHSCORE: gh.default,
					zRankWithScore: gh.default,
					ZRANK: Uh.default,
					zRank: Uh.default,
					ZREM: Gh.default,
					zRem: Gh.default,
					ZREMRANGEBYLEX: Yh.default,
					zRemRangeByLex: Yh.default,
					ZREMRANGEBYRANK: Bh.default,
					zRemRangeByRank: Bh.default,
					ZREMRANGEBYSCORE: bh.default,
					zRemRangeByScore: bh.default,
					ZREVRANK: qh.default,
					zRevRank: qh.default,
					ZSCAN: Hh.default,
					zScan: Hh.default,
					ZSCORE: jh.default,
					zScore: jh.default,
					ZUNION_WITHSCORES: Fh.default,
					zUnionWithScores: Fh.default,
					ZUNION: Kh.default,
					zUnion: Kh.default,
					ZUNIONSTORE: wh.default,
					zUnionStore: wh.default,
					VADD: Xh.default,
					vAdd: Xh.default,
					VCARD: Vh.default,
					vCard: Vh.default,
					VDIM: Wh.default,
					vDim: Wh.default,
					VEMB: xh.default,
					vEmb: xh.default,
					VEMB_RAW: Zh.default,
					vEmbRaw: Zh.default,
					VGETATTR: Jh.default,
					vGetAttr: Jh.default,
					VINFO: zh.default,
					vInfo: zh.default,
					VLINKS: Qh.default,
					vLinks: Qh.default,
					VLINKS_WITHSCORES: kh.default,
					vLinksWithScores: kh.default,
					VRANDMEMBER: $h.default,
					vRandMember: $h.default,
					VREM: eS.default,
					vRem: eS.default,
					VSETATTR: tS.default,
					vSetAttr: tS.default,
					VSIM: rS.default,
					vSim: rS.default,
					VSIM_WITHSCORES: nS.default,
					vSimWithScores: nS.default
				};
			})(ee)),
		ee
	);
}
var er = {},
	jr = {},
	eC;
function il() {
	return (
		eC ||
			((eC = 1),
			(function (e) {
				var r = {},
					n =
						(jr && jr.__importDefault) ||
						function (h) {
							return h && h.__esModule ? h : { default: h };
						};
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.emitDiagnostics = e.dbgMaintenance = e.MAINTENANCE_EVENTS = void 0));
				const u = gD,
					t = UD,
					i = n(GD),
					a = el,
					s = n(YD);
				e.MAINTENANCE_EVENTS = { PAUSE_WRITING: 'pause-writing', RESUME_WRITING: 'resume-writing', TIMEOUTS_UPDATE: 'timeouts-update' };
				const o = { MOVING: 'MOVING', MIGRATING: 'MIGRATING', MIGRATED: 'MIGRATED', FAILING_OVER: 'FAILING_OVER', FAILED_OVER: 'FAILED_OVER' },
					f = (...h) => {
						if (r.REDIS_DEBUG_MAINTENANCE) return console.log('[MNT]', ...h);
					};
				e.dbgMaintenance = f;
				const d = (h) => {
					if (!r.REDIS_EMIT_DIAGNOSTICS) return;
					s.default.channel('redis.maintenance').publish(h);
				};
				e.emitDiagnostics = d;
				class _ {
					#e;
					#t;
					#r = 0;
					#n;
					static setupDefaultMaintOptions(S) {
						(S.maintNotifications === void 0 && (S.maintNotifications = S?.RESP === 3 ? 'auto' : 'disabled'),
							S.maintEndpointType === void 0 && (S.maintEndpointType = 'auto'),
							S.maintRelaxedSocketTimeout === void 0 && (S.maintRelaxedSocketTimeout = 1e4),
							S.maintRelaxedCommandTimeout === void 0 && (S.maintRelaxedCommandTimeout = 1e4));
					}
					static async getHandshakeCommand(S) {
						if (S.maintNotifications === 'disabled') return;
						const O = S.url ? new URL(S.url).hostname : S.socket?.host;
						if (!O) return;
						const l = S.socket?.tls ?? !1;
						return {
							cmd: ['CLIENT', 'MAINT_NOTIFICATIONS', 'ON', 'moving-endpoint-type', await R(l, O, S)],
							errorHandler: (T) => {
								if (((0, e.dbgMaintenance)('handshake failed:', T), S.maintNotifications === 'enabled')) throw T;
							}
						};
					}
					constructor(S, O, l) {
						((this.#e = S), (this.#t = l), (this.#n = O), this.#e.addPushHandler(this.#s));
					}
					#s = (S) => {
						if (
							((0, e.dbgMaintenance)('ONPUSH:', S.map(String)),
							!Array.isArray(S) || !['MOVING', 'MIGRATING', 'MIGRATED', 'FAILING_OVER', 'FAILED_OVER'].includes(String(S[0])))
						)
							return !1;
						const O = String(S[0]);
						switch (((0, e.emitDiagnostics)({ type: O, timestamp: Date.now(), data: { push: S.map(String) } }), O)) {
							case o.MOVING: {
								const l = S[2],
									E = S[3] ? String(S[3]) : null;
								return ((0, e.dbgMaintenance)('Received MOVING:', l, E), this.#a(l, E), !0);
							}
							case o.MIGRATING:
							case o.FAILING_OVER:
								return ((0, e.dbgMaintenance)('Received MIGRATING|FAILING_OVER'), this.#u(), !0);
							case o.MIGRATED:
							case o.FAILED_OVER:
								return ((0, e.dbgMaintenance)('Received MIGRATED|FAILED_OVER'), this.#i(), !0);
						}
						return !1;
					};
					#a = async (S, O) => {
						this.#u();
						let l, E;
						if (O === null) {
							((0, i.default)(this.#t.maintEndpointType === 'none'),
								(0, i.default)(this.#t.socket !== void 0),
								(0, i.default)('host' in this.#t.socket),
								(0, i.default)(typeof this.#t.socket.host == 'string'),
								(l = this.#t.socket.host),
								(0, i.default)(typeof this.#t.socket.port == 'number'),
								(E = this.#t.socket.port));
							const m = (S * 1e3) / 2;
							((0, e.dbgMaintenance)(`Wait for ${m}ms`), await (0, a.setTimeout)(m));
						} else {
							const m = O.split(':');
							((l = m[0]), (E = Number(m[1])));
						}
						((0, e.dbgMaintenance)('Pausing writing of new commands to old socket'),
							this.#n._pause(),
							(0, e.dbgMaintenance)('Creating new tmp client'));
						let T = performance.now();
						if (this.#t.url) {
							const m = new URL(this.#t.url);
							((m.hostname = l), (m.port = String(E)), (this.#t.url = m.toString()));
						} else this.#t.socket = { ...this.#t.socket, host: l, port: E };
						const I = this.#n.duplicate();
						(I.on('error', (m) => {
							(0, e.dbgMaintenance)('[ERR]', m);
						}),
							(0, e.dbgMaintenance)(`Tmp client created in ${(performance.now() - T).toFixed(2)}ms`),
							(0, e.dbgMaintenance)(`Set timeout for tmp client to ${this.#t.maintRelaxedSocketTimeout}`),
							I._maintenanceUpdate({
								relaxedCommandTimeout: this.#t.maintRelaxedCommandTimeout,
								relaxedSocketTimeout: this.#t.maintRelaxedSocketTimeout
							}),
							(0, e.dbgMaintenance)(`Connecting tmp client: ${l}:${E}`),
							(T = performance.now()),
							await I.connect(),
							(0, e.dbgMaintenance)(`Connected to tmp client in ${(performance.now() - T).toFixed(2)}ms`),
							(0, e.dbgMaintenance)('Wait for all in-flight commands to complete'),
							await this.#e.waitForInflightCommandsToComplete(),
							(0, e.dbgMaintenance)('In-flight commands completed'),
							(0, e.dbgMaintenance)('Swap client sockets...'));
						const P = this.#n._ejectSocket(),
							D = I._ejectSocket();
						(this.#n._insertSocket(D),
							I._insertSocket(P),
							I.destroy(),
							(0, e.dbgMaintenance)('Swap client sockets done.'),
							(0, e.dbgMaintenance)('Resume writing'),
							this.#n._unpause(),
							this.#i());
					};
					#u = () => {
						if ((this.#r++, this.#r > 1)) {
							(0, e.dbgMaintenance)('Timeout relaxation already done');
							return;
						}
						const S = { relaxedCommandTimeout: this.#t.maintRelaxedCommandTimeout, relaxedSocketTimeout: this.#t.maintRelaxedSocketTimeout };
						this.#n._maintenanceUpdate(S);
					};
					#i = () => {
						if (((this.#r = Math.max(this.#r - 1, 0)), this.#r > 0)) {
							(0, e.dbgMaintenance)('Not ready to unrelax timeouts yet');
							return;
						}
						const S = { relaxedCommandTimeout: void 0, relaxedSocketTimeout: void 0 };
						this.#n._maintenanceUpdate(S);
					};
				}
				e.default = _;
				function c(h) {
					const S = (0, u.isIP)(h);
					if (S === 4) {
						const O = h.split('.').map(Number);
						return O[0] === 10 || (O[0] === 172 && O[1] >= 16 && O[1] <= 31) || (O[0] === 192 && O[1] === 168);
					}
					return S === 6 ? h.startsWith('fc') || h.startsWith('fd') || h === '::1' || h.startsWith('fe80') : !1;
				}
				async function R(h, S, O) {
					if (((0, i.default)(O.maintEndpointType !== void 0), O.maintEndpointType !== 'auto'))
						return ((0, e.dbgMaintenance)(`Determine endpoint type: ${O.maintEndpointType}`), O.maintEndpointType);
					const l = (0, u.isIP)(S) ? S : (await (0, t.lookup)(S, { family: 0 })).address,
						E = c(l);
					let T;
					return (
						h ? (T = E ? 'internal-fqdn' : 'external-fqdn') : (T = E ? 'internal-ip' : 'external-ip'),
						(0, e.dbgMaintenance)(`Determine endpoint type: ${T}`),
						T
					);
				}
			})(jr)),
		jr
	);
}
var tC;
function jU() {
	if (tC) return er;
	tC = 1;
	var e =
		(er && er.__importDefault) ||
		function (o) {
			return o && o.__esModule ? o : { default: o };
		};
	Object.defineProperty(er, '__esModule', { value: !0 });
	const r = gr,
		n = e(vD),
		u = e(bD),
		t = qe(),
		i = el,
		a = il();
	class s extends r.EventEmitter {
		#e;
		#t;
		#r;
		#n;
		#s;
		#a;
		#u;
		#i = !1;
		get isOpen() {
			return this.#i;
		}
		#o = !1;
		get isReady() {
			return this.#o;
		}
		#l = !1;
		#E = 0;
		get socketEpoch() {
			return this.#E;
		}
		constructor(f, d) {
			(super(), (this.#e = f), (this.#t = d?.connectTimeout ?? 5e3), (this.#r = this.#d(d)), (this.#n = this.#c(d)), (this.#s = d?.socketTimeout));
		}
		#d(f) {
			const d = f?.reconnectStrategy;
			return d === !1 || typeof d == 'number'
				? () => d
				: d
					? (_, c) => {
							try {
								const R = d(_, c);
								if (R !== !1 && !(R instanceof Error) && typeof R != 'number')
									throw new TypeError(`Reconnect strategy should return \`false | Error | number\`, got ${R} instead`);
								return R;
							} catch (R) {
								return (this.emit('error', R), this.defaultReconnectStrategy(_, R));
							}
						}
					: this.defaultReconnectStrategy;
		}
		#c(f) {
			if (f?.tls === !0) {
				const _ = {
					...f,
					port: f?.port ?? 6379,
					noDelay: f?.noDelay ?? !0,
					keepAlive: f?.keepAlive ?? !0,
					keepAliveInitialDelay: f?.keepAliveInitialDelay ?? 5e3,
					timeout: void 0,
					onread: void 0,
					readable: !0,
					writable: !0
				};
				return {
					create() {
						return u.default.connect(_);
					},
					event: 'secureConnect'
				};
			}
			if (f && 'path' in f) {
				const _ = { ...f, timeout: void 0, onread: void 0, readable: !0, writable: !0 };
				return {
					create() {
						return n.default.createConnection(_);
					},
					event: 'connect'
				};
			}
			const d = {
				...f,
				port: f?.port ?? 6379,
				noDelay: f?.noDelay ?? !0,
				keepAlive: f?.keepAlive ?? !0,
				keepAliveInitialDelay: f?.keepAliveInitialDelay ?? 5e3,
				timeout: void 0,
				onread: void 0,
				readable: !0,
				writable: !0
			};
			return {
				create() {
					return n.default.createConnection(d);
				},
				event: 'connect'
			};
		}
		#_(f, d) {
			const _ = this.#r(f, d);
			return _ === !1
				? ((this.#i = !1), this.emit('error', d), d)
				: _ instanceof Error
					? ((this.#i = !1), this.emit('error', d), new t.ReconnectStrategyError(_, d))
					: _;
		}
		async connect() {
			if (this.#i) throw new Error('Socket already opened');
			return ((this.#i = !0), this.#S());
		}
		async #S() {
			let f = 0;
			do
				try {
					((this.#u = await this.#R()), this.emit('connect'));
					try {
						if ((await this.#e(), !this.#u || this.#u.destroyed || !this.#u.readable || !this.#u.writable)) {
							const d = this.#_(f++, new t.SocketClosedUnexpectedlyError());
							if (typeof d != 'number') throw d;
							(await (0, i.setTimeout)(d), this.emit('reconnecting'));
							continue;
						}
					} catch (d) {
						throw (this.#u.destroy(), (this.#u = void 0), d);
					}
					((this.#o = !0), this.#E++, this.emit('ready'));
				} catch (d) {
					const _ = this.#_(f++, d);
					if (typeof _ != 'number') throw _;
					(this.emit('error', d), await (0, i.setTimeout)(_), this.emit('reconnecting'));
				}
			while (this.#i && !this.#o);
		}
		setMaintenanceTimeout(f) {
			if (((0, a.dbgMaintenance)(`Set socket timeout to ${f}`), this.#a === f)) {
				(0, a.dbgMaintenance)(`Socket already set maintenanceCommandTimeout to ${f}, skipping`);
				return;
			}
			((this.#a = f), f !== void 0 ? this.#u?.setTimeout(f) : this.#u?.setTimeout(this.#s ?? 0));
		}
		async #R() {
			const f = this.#n.create();
			let d;
			return (
				this.#t !== void 0 && ((d = () => f.destroy(new t.ConnectionTimeoutError())), f.once('timeout', d), f.setTimeout(this.#t)),
				this.#l && f.unref(),
				await (0, r.once)(f, this.#n.event),
				d && f.removeListener('timeout', d),
				this.#s &&
					(f.once('timeout', () => {
						const _ = this.#a ? new t.SocketTimeoutDuringMaintenanceError(this.#a) : new t.SocketTimeoutError(this.#s);
						f.destroy(_);
					}),
					f.setTimeout(this.#s)),
				f
					.once('error', (_) => this.#O(_))
					.once('close', (_) => {
						_ || !this.#i || this.#u !== f || this.#O(new t.SocketClosedUnexpectedlyError());
					})
					.on('drain', () => this.emit('drain'))
					.on('data', (_) => this.emit('data', _)),
				f
			);
		}
		#O(f) {
			const d = this.#o;
			((this.#o = !1),
				this.emit('error', f),
				!(!d || !this.#i || typeof this.#_(0, f) != 'number') && (this.emit('reconnecting'), this.#S().catch(() => {})));
		}
		write(f) {
			if (this.#u) {
				this.#u.cork();
				for (const d of f) {
					for (const _ of d) this.#u.write(_);
					if (this.#u.writableNeedDrain) break;
				}
				this.#u.uncork();
			}
		}
		async quit(f) {
			if (!this.#i) throw new t.ClientClosedError();
			this.#i = !1;
			const d = await f();
			return (this.destroySocket(), d);
		}
		close() {
			if (!this.#i) throw new t.ClientClosedError();
			this.#i = !1;
		}
		destroy() {
			if (!this.#i) throw new t.ClientClosedError();
			((this.#i = !1), this.destroySocket());
		}
		destroySocket() {
			((this.#o = !1), this.#u && (this.#u.destroy(), (this.#u = void 0)), this.emit('end'));
		}
		ref() {
			((this.#l = !1), this.#u?.ref());
		}
		unref() {
			((this.#l = !0), this.#u?.unref());
		}
		defaultReconnectStrategy(f, d) {
			if (d instanceof t.SocketTimeoutError) return !1;
			const _ = Math.floor(Math.random() * 200);
			return Math.min(Math.pow(2, f) * 50, 2e3) + _;
		}
	}
	return ((er.default = s), er);
}
var Zd = {},
	ke = {},
	Fr = {},
	rC;
function cD() {
	if (rC) return Fr;
	((rC = 1), Object.defineProperty(Fr, '__esModule', { value: !0 }), (Fr.Token = void 0));
	class e {
		value;
		expiresAtMs;
		receivedAtMs;
		constructor(n, u, t) {
			((this.value = n), (this.expiresAtMs = u), (this.receivedAtMs = t));
		}
		getTtlMs(n) {
			return this.expiresAtMs < n ? 0 : this.expiresAtMs - n;
		}
	}
	return ((Fr.Token = e), Fr);
}
var nC;
function FU() {
	if (nC) return ke;
	((nC = 1), Object.defineProperty(ke, '__esModule', { value: !0 }), (ke.TokenManager = ke.IDPError = void 0));
	const e = cD();
	class r extends Error {
		message;
		isRetryable;
		constructor(t, i) {
			(super(t), (this.message = t), (this.isRetryable = i), (this.name = 'IDPError'));
		}
	}
	ke.IDPError = r;
	class n {
		identityProvider;
		config;
		currentToken = null;
		refreshTimeout = null;
		listener = null;
		retryAttempt = 0;
		constructor(t, i) {
			if (((this.identityProvider = t), (this.config = i), this.config.expirationRefreshRatio > 1))
				throw new Error('expirationRefreshRatio must be less than or equal to 1');
			if (this.config.expirationRefreshRatio < 0) throw new Error('expirationRefreshRatio must be greater or equal to 0');
		}
		start(t, i = 0) {
			return (
				this.listener && this.stop(),
				(this.listener = t),
				(this.retryAttempt = 0),
				this.scheduleNextRefresh(i),
				{ dispose: () => this.stop() }
			);
		}
		calculateRetryDelay() {
			if (!this.config.retry) return 0;
			const { initialDelayMs: t, maxDelayMs: i, backoffMultiplier: a, jitterPercentage: s } = this.config.retry;
			let o = t * Math.pow(a, this.retryAttempt - 1);
			if (((o = Math.min(o, i)), s)) {
				const d = o * (s / 100),
					_ = Math.random() * d - d / 2;
				o += _;
			}
			return Math.max(0, Math.floor(o));
		}
		shouldRetry(t) {
			if (!this.config.retry) return !1;
			const { maxAttempts: i, isRetryable: a } = this.config.retry;
			return this.retryAttempt >= i ? !1 : a ? a(t, this.retryAttempt) : !1;
		}
		isRunning() {
			return this.listener !== null;
		}
		async refresh() {
			if (!this.listener) throw new Error('TokenManager is not running, but refresh was called');
			try {
				(await this.identityProvider.requestToken().then(this.handleNewToken), (this.retryAttempt = 0));
			} catch (t) {
				if (this.shouldRetry(t)) {
					this.retryAttempt++;
					const i = this.calculateRetryDelay();
					(this.notifyError(`Token refresh failed (attempt ${this.retryAttempt}), retrying in ${i}ms: ${t}`, !0), this.scheduleNextRefresh(i));
				} else (this.notifyError(t, !1), this.stop());
			}
		}
		handleNewToken = async ({ token: t, ttlMs: i }) => {
			if (!this.listener) throw new Error('TokenManager is not running, but a new token was received');
			const a = this.wrapAndSetCurrentToken(t, i);
			(this.listener.onNext(a), this.scheduleNextRefresh(this.calculateRefreshTime(a)));
		};
		wrapAndSetCurrentToken(t, i) {
			const a = Date.now(),
				s = new e.Token(t, a + i, a);
			return ((this.currentToken = s), s);
		}
		scheduleNextRefresh(t) {
			(this.refreshTimeout && (clearTimeout(this.refreshTimeout), (this.refreshTimeout = null)),
				t === 0 ? this.refresh() : (this.refreshTimeout = setTimeout(() => this.refresh(), t)));
		}
		calculateRefreshTime(t, i = Date.now()) {
			const a = t.getTtlMs(i);
			return Math.floor(a * this.config.expirationRefreshRatio);
		}
		stop() {
			(this.refreshTimeout && (clearTimeout(this.refreshTimeout), (this.refreshTimeout = null)),
				(this.listener = null),
				(this.currentToken = null),
				(this.retryAttempt = 0));
		}
		getCurrentToken() {
			return this.currentToken;
		}
		notifyError(t, i) {
			const a = t instanceof Error ? t.message : String(t);
			if (!this.listener) throw new Error(`TokenManager is not running but received an error: ${a}`);
			this.listener.onError(new r(a, i));
		}
	}
	return ((ke.TokenManager = n), ke);
}
var $e = {},
	uC;
function KU() {
	if (uC) return $e;
	((uC = 1), Object.defineProperty($e, '__esModule', { value: !0 }), ($e.UnableToObtainNewCredentialsError = $e.CredentialsError = void 0));
	class e extends Error {
		constructor(u) {
			(super(`Re-authentication with latest credentials failed: ${u}`), (this.name = 'CredentialsError'));
		}
	}
	$e.CredentialsError = e;
	class r extends Error {
		constructor(u) {
			(super(`Unable to obtain new credentials : ${u}`), (this.name = 'UnableToObtainNewCredentialsError'));
		}
	}
	return (($e.UnableToObtainNewCredentialsError = r), $e);
}
var iC;
function wU() {
	return (
		iC ||
			((iC = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.Token = e.CredentialsError = e.UnableToObtainNewCredentialsError = e.IDPError = e.TokenManager = void 0));
				var r = FU();
				(Object.defineProperty(e, 'TokenManager', {
					enumerable: !0,
					get: function () {
						return r.TokenManager;
					}
				}),
					Object.defineProperty(e, 'IDPError', {
						enumerable: !0,
						get: function () {
							return r.IDPError;
						}
					}));
				var n = KU();
				(Object.defineProperty(e, 'UnableToObtainNewCredentialsError', {
					enumerable: !0,
					get: function () {
						return n.UnableToObtainNewCredentialsError;
					}
				}),
					Object.defineProperty(e, 'CredentialsError', {
						enumerable: !0,
						get: function () {
							return n.CredentialsError;
						}
					}));
				var u = cD();
				Object.defineProperty(e, 'Token', {
					enumerable: !0,
					get: function () {
						return u.Token;
					}
				});
			})(Zd)),
		Zd
	);
}
var tr = {},
	te = {},
	sC;
function sl() {
	if (sC) return te;
	sC = 1;
	var e =
		(te && te.__importDefault) ||
		function (i) {
			return i && i.__esModule ? i : { default: i };
		};
	(Object.defineProperty(te, '__esModule', { value: !0 }), (te.EmptyAwareSinglyLinkedList = te.SinglyLinkedList = te.DoublyLinkedList = void 0));
	const r = e(BD);
	class n {
		#e = 0;
		get length() {
			return this.#e;
		}
		#t;
		get head() {
			return this.#t;
		}
		#r;
		get tail() {
			return this.#r;
		}
		push(a) {
			return (
				++this.#e,
				this.#r === void 0
					? (this.#t = this.#r = { previous: this.#t, next: void 0, value: a })
					: (this.#r = this.#r.next = { previous: this.#r, next: void 0, value: a })
			);
		}
		unshift(a) {
			return (
				++this.#e,
				this.#t === void 0
					? (this.#t = this.#r = { previous: void 0, next: void 0, value: a })
					: (this.#t = this.#t.previous = { previous: void 0, next: this.#t, value: a })
			);
		}
		add(a, s = !1) {
			return s ? this.unshift(a) : this.push(a);
		}
		shift() {
			if (this.#t === void 0) return;
			--this.#e;
			const a = this.#t;
			return (a.next ? ((a.next.previous = void 0), (this.#t = a.next), (a.next = void 0)) : (this.#t = this.#r = void 0), a.value);
		}
		remove(a) {
			this.#e !== 0 &&
				(--this.#e,
				this.#r === a && (this.#r = a.previous),
				this.#t === a ? (this.#t = a.next) : (a.previous && (a.previous.next = a.next), a.next && (a.next.previous = a.previous)),
				(a.previous = void 0),
				(a.next = void 0));
		}
		reset() {
			((this.#e = 0), (this.#t = this.#r = void 0));
		}
		*[Symbol.iterator]() {
			let a = this.#t;
			for (; a !== void 0; ) (yield a.value, (a = a.next));
		}
		*nodes() {
			let a = this.#t;
			for (; a; ) {
				const s = a.next;
				(yield a, (a = s));
			}
		}
	}
	te.DoublyLinkedList = n;
	class u {
		#e = 0;
		get length() {
			return this.#e;
		}
		#t;
		get head() {
			return this.#t;
		}
		#r;
		get tail() {
			return this.#r;
		}
		push(a) {
			++this.#e;
			const s = { value: a, next: void 0, removed: !1 };
			return this.#t === void 0 ? (this.#t = this.#r = s) : (this.#r.next = this.#r = s);
		}
		remove(a, s) {
			if (a.removed) throw new Error('node already removed');
			(--this.#e,
				this.#t === a
					? this.#r === a
						? (this.#t = this.#r = void 0)
						: (this.#t = a.next)
					: this.#r === a
						? ((this.#r = s), (s.next = void 0))
						: (s.next = a.next),
				(a.removed = !0));
		}
		shift() {
			if (this.#t === void 0) return;
			const a = this.#t;
			return (--this.#e === 0 ? (this.#t = this.#r = void 0) : (this.#t = a.next), (a.removed = !0), a.value);
		}
		reset() {
			((this.#e = 0), (this.#t = this.#r = void 0));
		}
		*[Symbol.iterator]() {
			let a = this.#t;
			for (; a !== void 0; ) (yield a.value, (a = a.next));
		}
	}
	te.SinglyLinkedList = u;
	class t extends u {
		events = new r.default();
		reset() {
			const a = this.length;
			(super.reset(), a !== this.length && this.length === 0 && this.events.emit('empty'));
		}
		shift() {
			const a = this.length,
				s = super.shift();
			return (a !== this.length && this.length === 0 && this.events.emit('empty'), s);
		}
		remove(a, s) {
			const o = this.length;
			(super.remove(a, s), o !== this.length && this.length === 0 && this.events.emit('empty'));
		}
	}
	return ((te.EmptyAwareSinglyLinkedList = t), te);
}
var Do = {},
	aC;
function XU() {
	if (aC) return Do;
	((aC = 1), Object.defineProperty(Do, '__esModule', { value: !0 }));
	const e = `\r
`;
	function r(n) {
		const u = [];
		let t = '*' + n.length + e;
		for (let i = 0; i < n.length; i++) {
			const a = n[i];
			if (typeof a == 'string') t += '$' + Buffer.byteLength(a) + e + a + e;
			else if (a instanceof Buffer) (u.push(t + '$' + a.length.toString() + e, a), (t = e));
			else throw new TypeError(`"arguments[${i}]" must be of type "string | Buffer", got ${typeof a} instead.`);
		}
		return (u.push(t), u);
	}
	return ((Do.default = r), Do);
}
var Jd = {},
	oC;
function Ud() {
	return (
		oC ||
			((oC = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.PubSub = e.PUBSUB_TYPE = void 0),
					(e.PUBSUB_TYPE = { CHANNELS: 'CHANNELS', PATTERNS: 'PATTERNS', SHARDED: 'SHARDED' }));
				const r = {
					[e.PUBSUB_TYPE.CHANNELS]: { subscribe: Buffer.from('subscribe'), unsubscribe: Buffer.from('unsubscribe'), message: Buffer.from('message') },
					[e.PUBSUB_TYPE.PATTERNS]: {
						subscribe: Buffer.from('psubscribe'),
						unsubscribe: Buffer.from('punsubscribe'),
						message: Buffer.from('pmessage')
					},
					[e.PUBSUB_TYPE.SHARDED]: {
						subscribe: Buffer.from('ssubscribe'),
						unsubscribe: Buffer.from('sunsubscribe'),
						message: Buffer.from('smessage')
					}
				};
				class n {
					static isStatusReply(t) {
						return (
							r[e.PUBSUB_TYPE.CHANNELS].subscribe.equals(t[0]) ||
							r[e.PUBSUB_TYPE.CHANNELS].unsubscribe.equals(t[0]) ||
							r[e.PUBSUB_TYPE.PATTERNS].subscribe.equals(t[0]) ||
							r[e.PUBSUB_TYPE.PATTERNS].unsubscribe.equals(t[0]) ||
							r[e.PUBSUB_TYPE.SHARDED].subscribe.equals(t[0])
						);
					}
					static isShardedUnsubscribe(t) {
						return r[e.PUBSUB_TYPE.SHARDED].unsubscribe.equals(t[0]);
					}
					static #e(t) {
						return Array.isArray(t) ? t : [t];
					}
					static #t(t, i) {
						return i ? t.buffers : t.strings;
					}
					#r = 0;
					#n = !1;
					get isActive() {
						return this.#n;
					}
					listeners = { [e.PUBSUB_TYPE.CHANNELS]: new Map(), [e.PUBSUB_TYPE.PATTERNS]: new Map(), [e.PUBSUB_TYPE.SHARDED]: new Map() };
					subscribe(t, i, a, s) {
						const o = [r[t].subscribe],
							f = n.#e(i);
						for (const d of f) {
							let _ = this.listeners[t].get(d);
							(!_ || _.unsubscribing) && o.push(d);
						}
						if (o.length === 1) {
							for (const d of f) n.#t(this.listeners[t].get(d), s).add(a);
							return;
						}
						return (
							(this.#n = !0),
							this.#r++,
							{
								args: o,
								channelsCounter: o.length - 1,
								resolve: () => {
									this.#r--;
									for (const d of f) {
										let _ = this.listeners[t].get(d);
										(_ || ((_ = { unsubscribing: !1, buffers: new Set(), strings: new Set() }), this.listeners[t].set(d, _)), n.#t(_, s).add(a));
									}
								},
								reject: () => {
									(this.#r--, this.#u());
								}
							}
						);
					}
					extendChannelListeners(t, i, a) {
						if (this.#s(t, i, a))
							return (
								(this.#n = !0),
								this.#r++,
								{
									args: [r[t].subscribe, i],
									channelsCounter: 1,
									resolve: () => this.#r--,
									reject: () => {
										(this.#r--, this.#u());
									}
								}
							);
					}
					#s(t, i, a) {
						const s = this.listeners[t].get(i);
						if (!s) return (this.listeners[t].set(i, a), !0);
						for (const o of a.buffers) s.buffers.add(o);
						for (const o of a.strings) s.strings.add(o);
						return !1;
					}
					extendTypeListeners(t, i) {
						const a = [r[t].subscribe];
						for (const [s, o] of i) this.#s(t, s, o) && a.push(s);
						if (a.length !== 1)
							return (
								(this.#n = !0),
								this.#r++,
								{
									args: a,
									channelsCounter: a.length - 1,
									resolve: () => this.#r--,
									reject: () => {
										(this.#r--, this.#u());
									}
								}
							);
					}
					unsubscribe(t, i, a, s) {
						const o = this.listeners[t];
						if (!i) return this.#a([r[t].unsubscribe], NaN, () => o.clear());
						const f = n.#e(i);
						if (!a)
							return this.#a([r[t].unsubscribe, ...f], f.length, () => {
								for (const _ of f) o.delete(_);
							});
						const d = [r[t].unsubscribe];
						for (const _ of f) {
							const c = o.get(_);
							if (c) {
								let R, h;
								if (
									(s ? ((R = c.buffers), (h = c.strings)) : ((R = c.strings), (h = c.buffers)),
									(R.has(a) ? R.size - 1 : R.size) !== 0 || h.size !== 0)
								)
									continue;
								c.unsubscribing = !0;
							}
							d.push(_);
						}
						if (d.length === 1) {
							for (const _ of f) n.#t(o.get(_), s).delete(a);
							return;
						}
						return this.#a(d, d.length - 1, () => {
							for (const _ of f) {
								const c = o.get(_);
								c && ((s ? c.buffers : c.strings).delete(a), c.buffers.size === 0 && c.strings.size === 0 && o.delete(_));
							}
						});
					}
					#a(t, i, a) {
						return {
							args: t,
							channelsCounter: i,
							resolve: () => {
								(a(), this.#u());
							},
							reject: void 0
						};
					}
					#u() {
						this.#n =
							this.listeners[e.PUBSUB_TYPE.CHANNELS].size !== 0 ||
							this.listeners[e.PUBSUB_TYPE.PATTERNS].size !== 0 ||
							this.listeners[e.PUBSUB_TYPE.SHARDED].size !== 0 ||
							this.#r !== 0;
					}
					reset() {
						((this.#n = !1), (this.#r = 0));
					}
					resubscribe() {
						const t = [];
						for (const [i, a] of Object.entries(this.listeners))
							a.size && ((this.#n = !0), i === e.PUBSUB_TYPE.SHARDED ? this.#o(t, a) : this.#i(t, i, a));
						return t;
					}
					#i(t, i, a) {
						this.#r++;
						const s = () => this.#r--;
						t.push({ args: [r[i].subscribe, ...a.keys()], channelsCounter: a.size, resolve: s, reject: s });
					}
					#o(t, i) {
						const a = () => this.#r--;
						for (const s of i.keys())
							(this.#r++, t.push({ args: [r[e.PUBSUB_TYPE.SHARDED].subscribe, s], channelsCounter: 1, resolve: a, reject: a }));
					}
					handleMessageReply(t) {
						return r[e.PUBSUB_TYPE.CHANNELS].message.equals(t[0])
							? (this.#l(e.PUBSUB_TYPE.CHANNELS, t[2], t[1]), !0)
							: r[e.PUBSUB_TYPE.PATTERNS].message.equals(t[0])
								? (this.#l(e.PUBSUB_TYPE.PATTERNS, t[3], t[2], t[1]), !0)
								: r[e.PUBSUB_TYPE.SHARDED].message.equals(t[0])
									? (this.#l(e.PUBSUB_TYPE.SHARDED, t[2], t[1]), !0)
									: !1;
					}
					removeShardedListeners(t) {
						const i = this.listeners[e.PUBSUB_TYPE.SHARDED].get(t);
						return (this.listeners[e.PUBSUB_TYPE.SHARDED].delete(t), this.#u(), i);
					}
					removeAllListeners() {
						const t = {
							[e.PUBSUB_TYPE.CHANNELS]: this.listeners[e.PUBSUB_TYPE.CHANNELS],
							[e.PUBSUB_TYPE.PATTERNS]: this.listeners[e.PUBSUB_TYPE.PATTERNS],
							[e.PUBSUB_TYPE.SHARDED]: this.listeners[e.PUBSUB_TYPE.SHARDED]
						};
						return (
							this.#u(),
							(this.listeners[e.PUBSUB_TYPE.CHANNELS] = new Map()),
							(this.listeners[e.PUBSUB_TYPE.PATTERNS] = new Map()),
							(this.listeners[e.PUBSUB_TYPE.SHARDED] = new Map()),
							t
						);
					}
					#l(t, i, a, s) {
						const o = (s ?? a).toString(),
							f = this.listeners[t].get(o);
						if (!f) return;
						for (const c of f.buffers) c(i, a);
						if (!f.strings.size) return;
						const d = s ? a.toString() : o,
							_ = d === '__redis__:invalidate' ? (i === null ? null : i.map((c) => c.toString())) : i.toString();
						for (const c of f.strings) c(_, d);
					}
				}
				e.PubSub = n;
			})(Jd)),
		Jd
	);
}
var fC;
function VU() {
	if (fC) return tr;
	fC = 1;
	var e =
		(tr && tr.__importDefault) ||
		function (_) {
			return _ && _.__esModule ? _ : { default: _ };
		};
	Object.defineProperty(tr, '__esModule', { value: !0 });
	const r = sl(),
		n = e(XU()),
		u = tl(),
		t = Ud(),
		i = qe(),
		a = il(),
		s = Buffer.from('pong'),
		o = Buffer.from('RESET'),
		f = { ...u.PUSH_TYPE_MAPPING, [u.RESP_TYPES.SIMPLE_STRING]: Buffer };
	class d {
		#e;
		#t;
		#r = new r.DoublyLinkedList();
		#n = new r.EmptyAwareSinglyLinkedList();
		#s;
		#a;
		decoder;
		#u = new t.PubSub();
		#i = [this.#d.bind(this)];
		#o;
		setMaintenanceCommandTimeout(c) {
			if (this.#o === c) {
				(0, a.dbgMaintenance)(`Queue already set maintenanceCommandTimeout to ${c}, skipping`);
				return;
			}
			if (((0, a.dbgMaintenance)(`Setting maintenance command timeout to ${c}`), (this.#o = c), this.#o === void 0)) {
				(0, a.dbgMaintenance)(
					'Queue will keep maintenanceCommandTimeout for exisitng commands, just to be on the safe side. New commands will receive normal timeouts'
				);
				return;
			}
			let R = 0;
			const h = this.#r.length;
			for (const S of this.#r.nodes()) {
				const O = S.value;
				(d.#A(O), R++);
				const l = this.#o,
					E = AbortSignal.timeout(l);
				((O.timeout = {
					signal: E,
					listener: () => {
						(this.#r.remove(S), O.reject(new i.CommandTimeoutDuringMaintenanceError(l)));
					},
					originalTimeout: O.timeout?.originalTimeout
				}),
					E.addEventListener('abort', O.timeout.listener, { once: !0 }));
			}
			(0, a.dbgMaintenance)(`Total of ${R} of ${h} timeouts reset to ${c}`);
		}
		get isPubSubActive() {
			return this.#u.isActive;
		}
		constructor(c, R, h) {
			((this.#e = c), (this.#t = R), (this.#s = h), (this.decoder = this.#_()));
		}
		#l(c) {
			this.#n.shift().resolve(c);
		}
		#E(c) {
			this.#n.shift().reject(c);
		}
		#d(c) {
			if (this.#u.handleMessageReply(c)) return !0;
			const R = t.PubSub.isShardedUnsubscribe(c);
			if (R && !this.#n.length) {
				const h = c[1].toString();
				return (this.#s(h, this.#u.removeShardedListeners(h)), !0);
			} else if (R || t.PubSub.isStatusReply(c)) {
				const h = this.#n.head.value;
				return (((Number.isNaN(h.channelsCounter) && c[2] === 0) || --h.channelsCounter === 0) && this.#n.shift().resolve(), !0);
			}
			return !1;
		}
		#c() {
			return this.#n.head.value.typeMapping ?? {};
		}
		#_() {
			return new u.Decoder({
				onReply: (c) => this.#l(c),
				onErrorReply: (c) => this.#E(c),
				onPush: (c) => {
					for (const R of this.#i) if (R(c)) return;
				},
				getTypeMapping: () => this.#c()
			});
		}
		addPushHandler(c) {
			this.#i.push(c);
		}
		async waitForInflightCommandsToComplete() {
			if (this.#n.length !== 0)
				return new Promise((c) => {
					this.#n.events.on('empty', c);
				});
		}
		addCommand(c, R) {
			return this.#t && this.#r.length + this.#n.length >= this.#t
				? Promise.reject(new Error('The queue is full'))
				: R?.abortSignal?.aborted
					? Promise.reject(new i.AbortError())
					: new Promise((h, S) => {
							let O;
							const l = {
									args: c,
									chainId: R?.chainId,
									abort: void 0,
									timeout: void 0,
									resolve: h,
									reject: S,
									channelsCounter: void 0,
									typeMapping: R?.typeMapping
								},
								E = this.#o ?? R?.timeout,
								T = this.#o !== void 0;
							if (E) {
								const P = AbortSignal.timeout(E);
								((l.timeout = {
									signal: P,
									listener: () => {
										(this.#r.remove(O), l.reject(T ? new i.CommandTimeoutDuringMaintenanceError(E) : new i.TimeoutError()));
									},
									originalTimeout: R?.timeout
								}),
									P.addEventListener('abort', l.timeout.listener, { once: !0 }));
							}
							const I = R?.abortSignal;
							(I &&
								((l.abort = {
									signal: I,
									listener: () => {
										(this.#r.remove(O), l.reject(new i.AbortError()));
									}
								}),
								I.addEventListener('abort', l.abort.listener, { once: !0 })),
								(O = this.#r.add(l, R?.asap)));
						});
		}
		#S(c, R = !1, h) {
			return new Promise((S, O) => {
				this.#r.add(
					{
						args: c.args,
						chainId: h,
						abort: void 0,
						timeout: void 0,
						resolve() {
							(c.resolve(), S());
						},
						reject(l) {
							(c.reject?.(), O(l));
						},
						channelsCounter: c.channelsCounter,
						typeMapping: u.PUSH_TYPE_MAPPING
					},
					R
				);
			});
		}
		#R() {
			this.#e === 2 &&
				((this.decoder.onReply = (c) => {
					if (Array.isArray(c)) {
						if (this.#d(c)) return;
						if (s.equals(c[0])) {
							const { resolve: R, typeMapping: h } = this.#n.shift(),
								S = c[1].length === 0 ? c[0] : c[1];
							R(h?.[u.RESP_TYPES.SIMPLE_STRING] === Buffer ? S : S.toString());
							return;
						}
					}
					return this.#l(c);
				}),
				(this.decoder.getTypeMapping = () => f));
		}
		subscribe(c, R, h, S) {
			const O = this.#u.subscribe(c, R, h, S);
			if (O) return (this.#R(), this.#S(O));
		}
		#O() {
			((this.decoder.onReply = (c) => this.#l(c)), (this.decoder.getTypeMapping = () => this.#c()));
		}
		unsubscribe(c, R, h, S) {
			const O = this.#u.unsubscribe(c, R, h, S);
			if (O) {
				if (O && this.#e === 2) {
					const { resolve: l } = O;
					O.resolve = () => {
						(this.#u.isActive || this.#O(), l());
					};
				}
				return this.#S(O);
			}
		}
		removeAllPubSubListeners() {
			return this.#u.removeAllListeners();
		}
		resubscribe(c) {
			const R = this.#u.resubscribe();
			if (R.length) return (this.#R(), Promise.all(R.map((h) => this.#S(h, !0, c))));
		}
		extendPubSubChannelListeners(c, R, h) {
			const S = this.#u.extendChannelListeners(c, R, h);
			if (S) return (this.#R(), this.#S(S));
		}
		extendPubSubListeners(c, R) {
			const h = this.#u.extendTypeListeners(c, R);
			if (h) return (this.#R(), this.#S(h));
		}
		getPubSubListeners(c) {
			return this.#u.listeners[c];
		}
		monitor(c, R) {
			return new Promise((h, S) => {
				const O = R?.typeMapping ?? {};
				this.#r.add(
					{
						args: ['MONITOR'],
						chainId: R?.chainId,
						abort: void 0,
						timeout: void 0,
						resolve: () => {
							(this.#m ? (this.#m = c) : (this.decoder.onReply = c), (this.decoder.getTypeMapping = () => O), h());
						},
						reject: S,
						channelsCounter: void 0,
						typeMapping: O
					},
					R?.asap
				);
			});
		}
		resetDecoder() {
			(this.#O(), this.decoder.reset());
		}
		#m;
		async reset(c, R) {
			return new Promise((h, S) => {
				((this.#m = this.decoder.onReply),
					(this.decoder.onReply = (O) => {
						if ((typeof O == 'string' && O === 'RESET') || (O instanceof Buffer && o.equals(O))) {
							(this.#O(), (this.#m = void 0), this.#u.reset(), this.#n.shift().resolve(O));
							return;
						}
						this.#m(O);
					}),
					this.#r.push({
						args: ['RESET'],
						chainId: c,
						abort: void 0,
						timeout: void 0,
						resolve: h,
						reject: S,
						channelsCounter: void 0,
						typeMapping: R
					}));
			});
		}
		isWaitingToWrite() {
			return this.#r.length > 0;
		}
		*commandsToWrite() {
			let c = this.#r.shift();
			for (; c; ) {
				let R;
				try {
					R = (0, n.default)(c.args);
				} catch (h) {
					(c.reject(h), (c = this.#r.shift()));
					continue;
				}
				((c.args = void 0),
					c.abort && (d.#N(c), (c.abort = void 0)),
					c.timeout && (d.#A(c), (c.timeout = void 0)),
					(this.#a = c.chainId),
					(c.chainId = void 0),
					this.#n.push(c),
					yield R,
					(c = this.#r.shift()));
			}
		}
		#h(c) {
			for (const R of this.#n) R.reject(c);
			this.#n.reset();
		}
		static #N(c) {
			c.abort.signal.removeEventListener('abort', c.abort.listener);
		}
		static #A(c) {
			c.timeout?.signal.removeEventListener('abort', c.timeout.listener);
		}
		static #T(c, R) {
			(c.abort && d.#N(c), c.timeout && d.#A(c), c.reject(R));
		}
		flushWaitingForReply(c) {
			if ((this.resetDecoder(), this.#u.reset(), this.#h(c), !!this.#a)) {
				for (; this.#r.head?.value.chainId === this.#a; ) d.#T(this.#r.shift(), c);
				this.#a = void 0;
			}
		}
		flushAll(c) {
			(this.resetDecoder(), this.#u.reset(), this.#h(c));
			for (const R of this.#r) d.#T(R, c);
			this.#r.reset();
		}
		isEmpty() {
			return this.#r.length === 0 && this.#n.length === 0;
		}
	}
	return ((tr.default = d), tr);
}
var re = {},
	dC;
function Fe() {
	if (dC) return re;
	((dC = 1),
		Object.defineProperty(re, '__esModule', { value: !0 }),
		(re.scriptArgumentsPrefix = re.functionArgumentsPrefix = re.getTransformReply = re.attachConfig = void 0));
	function e() {
		throw new Error('Some RESP3 results for Redis Query Engine responses may change. Refer to the readme for guidance');
	}
	function r({ BaseClass: a, commands: s, createCommand: o, createModuleCommand: f, createFunctionCommand: d, createScriptCommand: _, config: c }) {
		const R = c?.RESP ?? 2,
			h = class extends a {};
		for (const [S, O] of Object.entries(s)) c?.RESP == 3 && O.unstableResp3 && !c.unstableResp3 ? (h.prototype[S] = e) : (h.prototype[S] = o(O, R));
		if (c?.modules)
			for (const [S, O] of Object.entries(c.modules)) {
				const l = Object.create(null);
				for (const [E, T] of Object.entries(O)) c.RESP == 3 && T.unstableResp3 && !c.unstableResp3 ? (l[E] = e) : (l[E] = f(T, R));
				n(h.prototype, S, l);
			}
		if (c?.functions)
			for (const [S, O] of Object.entries(c.functions)) {
				const l = Object.create(null);
				for (const [E, T] of Object.entries(O)) l[E] = d(E, T, R);
				n(h.prototype, S, l);
			}
		if (c?.scripts) for (const [S, O] of Object.entries(c.scripts)) h.prototype[S] = _(O, R);
		return h;
	}
	re.attachConfig = r;
	function n(a, s, o) {
		Object.defineProperty(a, s, {
			get() {
				const f = Object.create(o);
				return ((f._self = this), Object.defineProperty(this, s, { value: f }), f);
			}
		});
	}
	function u(a, s) {
		switch (typeof a.transformReply) {
			case 'function':
				return a.transformReply;
			case 'object':
				return a.transformReply[s];
		}
	}
	re.getTransformReply = u;
	function t(a, s) {
		const o = [s.IS_READ_ONLY ? 'FCALL_RO' : 'FCALL', a];
		return (s.NUMBER_OF_KEYS !== void 0 && o.push(s.NUMBER_OF_KEYS.toString()), o);
	}
	re.functionArgumentsPrefix = t;
	function i(a) {
		const s = [a.IS_READ_ONLY ? 'EVALSHA_RO' : 'EVALSHA', a.SHA1];
		return (a.NUMBER_OF_KEYS !== void 0 && s.push(a.NUMBER_OF_KEYS.toString()), s);
	}
	return ((re.scriptArgumentsPrefix = i), re);
}
var rr = {},
	yo = {},
	lC;
function Gd() {
	if (lC) return yo;
	((lC = 1), Object.defineProperty(yo, '__esModule', { value: !0 }));
	const e = qe();
	class r {
		typeMapping;
		constructor(u) {
			this.typeMapping = u;
		}
		queue = [];
		scriptsInUse = new Set();
		addCommand(u, t) {
			this.queue.push({ args: u, transformReply: t });
		}
		addScript(u, t, i) {
			const a = [];
			((a.preserve = t.preserve),
				this.scriptsInUse.has(u.SHA1) ? a.push('EVALSHA', u.SHA1) : (this.scriptsInUse.add(u.SHA1), a.push('EVAL', u.SCRIPT)),
				u.NUMBER_OF_KEYS !== void 0 && a.push(u.NUMBER_OF_KEYS.toString()),
				a.push(...t),
				this.addCommand(a, i));
		}
		transformReplies(u) {
			const t = [],
				i = u.map((a, s) => {
					if (a instanceof e.ErrorReply) return (t.push(s), a);
					const { transformReply: o, args: f } = this.queue[s];
					return o ? o(a, f.preserve, this.typeMapping) : a;
				});
			if (t.length) throw new e.MultiErrorReply(i, t);
			return i;
		}
	}
	return ((yo.default = r), yo);
}
var cC;
function _D() {
	if (cC) return rr;
	cC = 1;
	var e =
		(rr && rr.__importDefault) ||
		function (a) {
			return a && a.__esModule ? a : { default: a };
		};
	Object.defineProperty(rr, '__esModule', { value: !0 });
	const r = e(je()),
		n = e(Gd()),
		u = Fe(),
		t = He();
	class i {
		static #e(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				return ((c.preserve = _.preserve), this.addCommand(c, f));
			};
		}
		static #t(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				return ((c.preserve = _.preserve), this._self.addCommand(c, f));
			};
		}
		static #r(s, o, f) {
			const d = (0, u.functionArgumentsPrefix)(s, o),
				_ = (0, u.getTransformReply)(o, f);
			return function (...c) {
				const R = new t.BasicCommandParser();
				(R.push(...d), o.parseCommand(R, ...c));
				const h = R.redisArgs;
				return ((h.preserve = R.preserve), this._self.addCommand(h, _));
			};
		}
		static #n(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				return ((c.preserve = _.preserve), this.#o(s, c, f));
			};
		}
		static extend(s) {
			return (0, u.attachConfig)({
				BaseClass: i,
				commands: r.default,
				createCommand: i.#e,
				createModuleCommand: i.#t,
				createFunctionCommand: i.#r,
				createScriptCommand: i.#n,
				config: s
			});
		}
		#s;
		#a;
		#u;
		#i;
		constructor(s, o, f) {
			((this.#s = new n.default(f)), (this.#a = s), (this.#u = o));
		}
		SELECT(s, o) {
			return ((this.#i = s), this.#s.addCommand(['SELECT', s.toString()], o), this);
		}
		select = this.SELECT;
		addCommand(s, o) {
			return (this.#s.addCommand(s, o), this);
		}
		#o(s, o, f) {
			return (this.#s.addScript(s, o, f), this);
		}
		async exec(s = !1) {
			return s ? this.execAsPipeline() : this.#s.transformReplies(await this.#a(this.#s.queue, this.#i));
		}
		EXEC = this.exec;
		execTyped(s = !1) {
			return this.exec(s);
		}
		async execAsPipeline() {
			return this.#s.queue.length === 0 ? [] : this.#s.transformReplies(await this.#u(this.#s.queue, this.#i));
		}
		execAsPipelineTyped() {
			return this.execAsPipeline();
		}
	}
	return ((rr.default = i), rr);
}
var et = {},
	_C;
function WU() {
	if (_C) return et;
	_C = 1;
	var e =
		(et && et.__importDefault) ||
		function (a) {
			return a && a.__esModule ? a : { default: a };
		};
	(Object.defineProperty(et, '__esModule', { value: !0 }), (et.RedisLegacyClient = void 0));
	const r = Fe(),
		n = e(je()),
		u = e(Gd());
	class t {
		static #e(s, o) {
			let f;
			return (typeof o[o.length - 1] == 'function' && (f = o.pop()), t.pushArguments(s, o), f);
		}
		static pushArguments(s, o) {
			for (let f = 0; f < o.length; ++f) {
				const d = o[f];
				Array.isArray(d) ? t.pushArguments(s, d) : s.push(typeof d == 'number' || d instanceof Date ? d.toString() : d);
			}
		}
		static getTransformReply(s, o) {
			return s.TRANSFORM_LEGACY_REPLY ? (0, r.getTransformReply)(s, o) : void 0;
		}
		static #t(s, o, f) {
			const d = t.getTransformReply(o, f);
			return function (..._) {
				const c = [s],
					R = t.#e(c, _),
					h = this.#r.sendCommand(c);
				if (!R) {
					h.catch((S) => this.#r.emit('error', S));
					return;
				}
				h.then((S) => R(null, d ? d(S) : S)).catch((S) => R(S));
			};
		}
		#r;
		#n;
		constructor(s) {
			this.#r = s;
			const o = s.options?.RESP ?? 2;
			for (const [f, d] of Object.entries(n.default)) this[f] = t.#t(f, d, o);
			this.#n = i.factory(o);
		}
		sendCommand(...s) {
			const o = [],
				f = t.#e(o, s),
				d = this.#r.sendCommand(o);
			if (!f) {
				d.catch((_) => this.#r.emit('error', _));
				return;
			}
			d.then((_) => f(null, _)).catch((_) => f(_));
		}
		multi() {
			return this.#n(this.#r);
		}
	}
	et.RedisLegacyClient = t;
	class i {
		static #e(s, o, f) {
			const d = t.getTransformReply(o, f);
			return function (..._) {
				const c = [s];
				return (t.pushArguments(c, _), this.#t.addCommand(c, d), this);
			};
		}
		static factory(s) {
			const o = class extends i {};
			for (const [f, d] of Object.entries(n.default)) o.prototype[f] = i.#e(f, d, s);
			return (f) => new o(f);
		}
		#t = new u.default();
		#r;
		constructor(s) {
			this.#r = s;
		}
		sendCommand(...s) {
			const o = [];
			return (t.pushArguments(o, s), this.#t.addCommand(o), this);
		}
		exec(s) {
			const o = this.#r._executeMulti(this.#t.queue);
			if (!s) {
				o.catch((f) => this.#r.emit('error', f));
				return;
			}
			o.then((f) => s(null, this.#t.transformReplies(f))).catch((f) => s?.(f));
		}
	}
	return et;
}
var tt = {},
	W = {},
	EC;
function zr() {
	if (EC) return W;
	((EC = 1),
		Object.defineProperty(W, '__esModule', { value: !0 }),
		(W.PooledNoRedirectClientSideCache =
			W.BasicPooledClientSideCache =
			W.PooledClientSideCacheProvider =
			W.BasicClientSideCache =
			W.ClientSideCacheProvider =
			W.CacheStats =
				void 0));
	const e = HD;
	class r {
		hitCount;
		missCount;
		loadSuccessCount;
		loadFailureCount;
		totalLoadTime;
		evictionCount;
		constructor(l, E, T, I, P, D) {
			if (
				((this.hitCount = l),
				(this.missCount = E),
				(this.loadSuccessCount = T),
				(this.loadFailureCount = I),
				(this.totalLoadTime = P),
				(this.evictionCount = D),
				l < 0 || E < 0 || T < 0 || I < 0 || P < 0 || D < 0)
			)
				throw new Error('All statistics values must be non-negative');
		}
		static of(l = 0, E = 0, T = 0, I = 0, P = 0, D = 0) {
			return new r(l, E, T, I, P, D);
		}
		static empty() {
			return r.EMPTY_STATS;
		}
		static EMPTY_STATS = new r(0, 0, 0, 0, 0, 0);
		requestCount() {
			return this.hitCount + this.missCount;
		}
		hitRate() {
			const l = this.requestCount();
			return l === 0 ? 1 : this.hitCount / l;
		}
		missRate() {
			const l = this.requestCount();
			return l === 0 ? 0 : this.missCount / l;
		}
		loadCount() {
			return this.loadSuccessCount + this.loadFailureCount;
		}
		loadFailureRate() {
			const l = this.loadCount();
			return l === 0 ? 0 : this.loadFailureCount / l;
		}
		averageLoadPenalty() {
			const l = this.loadCount();
			return l === 0 ? 0 : this.totalLoadTime / l;
		}
		minus(l) {
			return r.of(
				Math.max(0, this.hitCount - l.hitCount),
				Math.max(0, this.missCount - l.missCount),
				Math.max(0, this.loadSuccessCount - l.loadSuccessCount),
				Math.max(0, this.loadFailureCount - l.loadFailureCount),
				Math.max(0, this.totalLoadTime - l.totalLoadTime),
				Math.max(0, this.evictionCount - l.evictionCount)
			);
		}
		plus(l) {
			return r.of(
				this.hitCount + l.hitCount,
				this.missCount + l.missCount,
				this.loadSuccessCount + l.loadSuccessCount,
				this.loadFailureCount + l.loadFailureCount,
				this.totalLoadTime + l.totalLoadTime,
				this.evictionCount + l.evictionCount
			);
		}
	}
	W.CacheStats = r;
	class n {
		static INSTANCE = new n();
		constructor() {}
		recordHits(l) {}
		recordMisses(l) {}
		recordLoadSuccess(l) {}
		recordLoadFailure(l) {}
		recordEvictions(l) {}
		snapshot() {
			return r.empty();
		}
	}
	function u() {
		return n.INSTANCE;
	}
	class t {
		#e = 0;
		#t = 0;
		#r = 0;
		#n = 0;
		#s = 0;
		#a = 0;
		recordHits(l) {
			this.#e += l;
		}
		recordMisses(l) {
			this.#t += l;
		}
		recordLoadSuccess(l) {
			(this.#r++, (this.#s += l));
		}
		recordLoadFailure(l) {
			(this.#n++, (this.#s += l));
		}
		recordEvictions(l) {
			this.#a += l;
		}
		snapshot() {
			return r.of(this.#e, this.#t, this.#r, this.#n, this.#s, this.#a);
		}
		static create() {
			return new t();
		}
	}
	function i(O) {
		const l = new Array(O.length * 2);
		for (let E = 0; E < O.length; E++) ((l[E] = O[E].length), (l[E + O.length] = O[E]));
		return l.join('_');
	}
	class a {
		#e = !1;
		#t;
		constructor(l) {
			l == 0 ? (this.#t = 0) : (this.#t = Date.now() + l);
		}
		invalidate() {
			this.#e = !0;
		}
		validate() {
			return !this.#e && (this.#t == 0 || Date.now() < this.#t);
		}
	}
	class s extends a {
		#e;
		get value() {
			return this.#e;
		}
		constructor(l, E) {
			(super(l), (this.#e = E));
		}
	}
	class o extends a {
		#e;
		get promise() {
			return this.#e;
		}
		constructor(l, E) {
			(super(l), (this.#e = E));
		}
	}
	class f extends e.EventEmitter {}
	W.ClientSideCacheProvider = f;
	class d extends f {
		#e;
		#t;
		ttl;
		maxEntries;
		lru;
		#r;
		recordEvictions(l) {
			this.#r.recordEvictions(l);
		}
		recordHits(l) {
			this.#r.recordHits(l);
		}
		recordMisses(l) {
			this.#r.recordMisses(l);
		}
		constructor(l) {
			(super(),
				(this.#e = new Map()),
				(this.#t = new Map()),
				(this.ttl = l?.ttl ?? 0),
				(this.maxEntries = l?.maxEntries ?? 0),
				(this.lru = l?.evictPolicy !== 'FIFO'));
			const E = l?.recordStats !== !1;
			this.#r = E ? t.create() : u();
		}
		async handleCache(l, E, T, I, P) {
			let D;
			const m = i(E.redisArgs);
			let A = this.get(m);
			if (A) {
				if (A instanceof s) return (this.#r.recordHits(1), structuredClone(A.value));
				if (A instanceof o) (this.#r.recordMisses(1), (D = await A.promise));
				else throw new Error('unknown cache entry type');
			} else {
				this.#r.recordMisses(1);
				const C = performance.now(),
					y = T();
				((A = this.createPromiseEntry(l, y)), this.set(m, A, E.keys));
				try {
					D = await y;
					const b = performance.now() - C;
					this.#r.recordLoadSuccess(b);
				} catch (b) {
					const U = performance.now() - C;
					throw (this.#r.recordLoadFailure(U), A.validate() && this.delete(m), b);
				}
			}
			let N;
			return (
				I ? (N = I(D, E.preserve, P)) : (N = D),
				A.validate() && ((A = this.createValueEntry(l, N)), this.set(m, A, E.keys), this.emit('cached-key', m)),
				structuredClone(N)
			);
		}
		trackingOn() {
			return ['CLIENT', 'TRACKING', 'ON'];
		}
		invalidate(l) {
			if (l === null) {
				(this.clear(!1), this.emit('invalidate', l));
				return;
			}
			const E = this.#t.get(l.toString());
			if (E) {
				for (const T of E) {
					const I = this.#e.get(T);
					(I && I.invalidate(), this.#e.delete(T));
				}
				this.#t.delete(l.toString());
			}
			this.emit('invalidate', l);
		}
		clear(l = !0) {
			const E = this.#e.size;
			(this.#e.clear(), this.#t.clear(), l ? this.#r instanceof n || (this.#r = t.create()) : E > 0 && this.#r.recordEvictions(E));
		}
		get(l) {
			const E = this.#e.get(l);
			if (E && !E.validate()) {
				(this.delete(l), this.#r.recordEvictions(1), this.emit('cache-evict', l));
				return;
			}
			return (E !== void 0 && this.lru && (this.#e.delete(l), this.#e.set(l, E)), E);
		}
		delete(l) {
			const E = this.#e.get(l);
			E && (E.invalidate(), this.#e.delete(l));
		}
		has(l) {
			return this.#e.has(l);
		}
		set(l, E, T) {
			let I = this.#e.size;
			const P = this.#e.get(l);
			(P && (I--, P.invalidate()),
				this.maxEntries > 0 && I >= this.maxEntries && (this.deleteOldest(), this.#r.recordEvictions(1)),
				this.#e.set(l, E));
			for (const D of T) (this.#t.has(D.toString()) || this.#t.set(D.toString(), new Set()), this.#t.get(D.toString()).add(l));
		}
		size() {
			return this.#e.size;
		}
		createValueEntry(l, E) {
			return new s(this.ttl, E);
		}
		createPromiseEntry(l, E) {
			return new o(this.ttl, E);
		}
		stats() {
			return this.#r.snapshot();
		}
		onError() {
			this.clear();
		}
		onClose() {
			this.clear();
		}
		deleteOldest() {
			const E = this.#e[Symbol.iterator]().next();
			if (!E.done) {
				const T = E.value[0],
					I = this.#e.get(T);
				(I && I.invalidate(), this.#e.delete(T));
			}
		}
		entryEntries() {
			return this.#e.entries();
		}
		keySetEntries() {
			return this.#t.entries();
		}
	}
	W.BasicClientSideCache = d;
	class _ extends d {
		#e = !1;
		disable() {
			this.#e = !0;
		}
		enable() {
			this.#e = !1;
		}
		get(l) {
			if (!this.#e) return super.get(l);
		}
		has(l) {
			return this.#e ? !1 : super.has(l);
		}
		onPoolClose() {
			this.clear();
		}
	}
	W.PooledClientSideCacheProvider = _;
	class c extends _ {
		onError() {
			this.clear(!1);
		}
		onClose() {
			this.clear(!1);
		}
	}
	W.BasicPooledClientSideCache = c;
	class R extends s {
		#e;
		constructor(l, E, T) {
			(super(l, T), (this.#e = E));
		}
		validate() {
			let l = super.validate();
			return (this.#e && (l = l && this.#e.client.isReady && this.#e.client.socketEpoch == this.#e.epoch), l);
		}
	}
	class h extends o {
		#e;
		constructor(l, E, T) {
			(super(l, T), (this.#e = E));
		}
		validate() {
			return super.validate() && this.#e.client.isReady && this.#e.client.socketEpoch == this.#e.epoch;
		}
	}
	class S extends c {
		createValueEntry(l, E) {
			const T = { epoch: l.socketEpoch, client: l };
			return new R(this.ttl, T, E);
		}
		createPromiseEntry(l, E) {
			const T = { epoch: l.socketEpoch, client: l };
			return new h(this.ttl, T, E);
		}
		onError() {}
		onClose() {}
	}
	return ((W.PooledNoRedirectClientSideCache = S), W);
}
var Po = {},
	RC;
function al() {
	if (RC) return Po;
	((RC = 1), Object.defineProperty(Po, '__esModule', { value: !0 }));
	class e {
		#e;
		#t;
		get(u) {
			return JSON.stringify(u, r()) === this.#t ? this.#e : void 0;
		}
		set(u, t) {
			((this.#e = t), (this.#t = JSON.stringify(u, r())));
		}
	}
	Po.default = e;
	function r() {
		const n = new WeakSet();
		return function (t, i) {
			return i && typeof i == 'object' ? (n.has(i) ? 'circular' : (n.add(i), i)) : i;
		};
	}
	return Po;
}
var hC;
function ED() {
	if (hC) return tt;
	hC = 1;
	var e =
		(tt && tt.__importDefault) ||
		function (c) {
			return c && c.__esModule ? c : { default: c };
		};
	(Object.defineProperty(tt, '__esModule', { value: !0 }), (tt.RedisClientPool = void 0));
	const r = e(je()),
		n = e(Qr()),
		u = gr,
		t = sl(),
		i = qe(),
		a = Fe(),
		s = e(_D()),
		o = zr(),
		f = He(),
		d = e(al());
	class _ extends u.EventEmitter {
		static #e(R, h) {
			const S = (0, a.getTransformReply)(R, h);
			return async function (...O) {
				const l = new f.BasicCommandParser();
				return (R.parseCommand(l, ...O), this.execute((E) => E._executeCommand(R, l, this._commandOptions, S)));
			};
		}
		static #t(R, h) {
			const S = (0, a.getTransformReply)(R, h);
			return async function (...O) {
				const l = new f.BasicCommandParser();
				return (R.parseCommand(l, ...O), this._self.execute((E) => E._executeCommand(R, l, this._self._commandOptions, S)));
			};
		}
		static #r(R, h, S) {
			const O = (0, a.functionArgumentsPrefix)(R, h),
				l = (0, a.getTransformReply)(h, S);
			return async function (...E) {
				const T = new f.BasicCommandParser();
				return (T.push(...O), h.parseCommand(T, ...E), this._self.execute((I) => I._executeCommand(h, T, this._self._commandOptions, l)));
			};
		}
		static #n(R, h) {
			const S = (0, a.scriptArgumentsPrefix)(R),
				O = (0, a.getTransformReply)(R, h);
			return async function (...l) {
				const E = new f.BasicCommandParser();
				return (E.pushVariadic(S), R.parseCommand(E, ...l), this.execute((T) => T._executeScript(R, E, this._commandOptions, O)));
			};
		}
		static #s = new d.default();
		static create(R, h) {
			let S = _.#s.get(R);
			return (
				S ||
					((S = (0, a.attachConfig)({
						BaseClass: _,
						commands: r.default,
						createCommand: _.#e,
						createModuleCommand: _.#t,
						createFunctionCommand: _.#r,
						createScriptCommand: _.#n,
						config: R
					})),
					(S.prototype.Multi = s.default.extend(R)),
					_.#s.set(R, S)),
				Object.create(new S(R, h))
			);
		}
		static #a = { minimum: 1, maximum: 100, acquireTimeout: 3e3, cleanupDelay: 3e3 };
		#u;
		#i;
		#o = new t.SinglyLinkedList();
		get idleClients() {
			return this._self.#o.length;
		}
		#l = new t.DoublyLinkedList();
		get clientsInUse() {
			return this._self.#l.length;
		}
		get totalClients() {
			return this._self.#o.length + this._self.#l.length;
		}
		#E = new t.SinglyLinkedList();
		get tasksQueueLength() {
			return this._self.#E.length;
		}
		#d = !1;
		get isOpen() {
			return this._self.#d;
		}
		#c = !1;
		get isClosing() {
			return this._self.#c;
		}
		#_;
		get clientSideCache() {
			return this._self.#_;
		}
		constructor(R, h) {
			if ((super(), (this.#i = { ..._.#a, ...h }), h?.clientSideCache))
				if ((R === void 0 && (R = {}), h.clientSideCache instanceof o.PooledClientSideCacheProvider)) this.#_ = R.clientSideCache = h.clientSideCache;
				else {
					const S = h.clientSideCache;
					this.#_ = R.clientSideCache = new o.BasicPooledClientSideCache(S);
				}
			this.#u = n.default.factory(R).bind(void 0, R);
		}
		_self = this;
		_commandOptions;
		withCommandOptions(R) {
			const h = Object.create(this._self);
			return ((h._commandOptions = R), h);
		}
		#S(R, h) {
			const S = Object.create(this._self);
			return ((S._commandOptions = Object.create(this._commandOptions ?? null)), (S._commandOptions[R] = h), S);
		}
		withTypeMapping(R) {
			return this._self.#S('typeMapping', R);
		}
		withAbortSignal(R) {
			return this._self.#S('abortSignal', R);
		}
		asap() {
			return this._self.#S('asap', !0);
		}
		async connect() {
			if (this._self.#d) return;
			this._self.#d = !0;
			const R = [];
			for (; R.length < this._self.#i.minimum; ) R.push(this._self.#R());
			try {
				await Promise.all(R);
			} catch (h) {
				throw (this.destroy(), h);
			}
			return this;
		}
		async #R() {
			const R = this._self.#l.push(this._self.#u().on('error', (h) => this.emit('error', h)));
			try {
				await R.value.connect();
			} catch (h) {
				throw (this._self.#l.remove(R), h);
			}
			this._self.#m(R);
		}
		execute(R) {
			return new Promise((h, S) => {
				const O = this._self.#o.shift(),
					{ tail: l } = this._self.#E;
				if (!O) {
					let T;
					this._self.#i.acquireTimeout > 0 &&
						(T = setTimeout(() => {
							(this._self.#E.remove(I, l), S(new i.TimeoutError('Timeout waiting for a client')));
						}, this._self.#i.acquireTimeout));
					const I = this._self.#E.push({ timeout: T, resolve: h, reject: S, fn: R });
					this.totalClients < this._self.#i.maximum && this._self.#R();
					return;
				}
				const E = this._self.#l.push(O);
				this._self.#O(E, h, S, R);
			});
		}
		#O(R, h, S, O) {
			const l = O(R.value);
			l instanceof Promise ? l.then(h, S).finally(() => this.#m(R)) : (h(l), this.#m(R));
		}
		#m(R) {
			const h = this.#E.shift();
			if (h) {
				(clearTimeout(h.timeout), this.#O(R, h.resolve, h.reject, h.fn));
				return;
			}
			(this.#l.remove(R), this.#o.push(R.value), this.#h());
		}
		cleanupTimeout;
		#h() {
			this.totalClients <= this.#i.minimum ||
				(clearTimeout(this.cleanupTimeout), (this.cleanupTimeout = setTimeout(() => this.#N(), this.#i.cleanupDelay)));
		}
		#N() {
			const R = Math.min(this.#o.length, this.totalClients - this.#i.minimum);
			for (let h = 0; h < R; h++) this.#o.shift().destroy();
		}
		sendCommand(R, h) {
			return this.execute((S) => S.sendCommand(R, h));
		}
		MULTI() {
			return new this.Multi(
				(R, h) => this.execute((S) => S._executeMulti(R, h)),
				(R) => this.execute((h) => h._executePipeline(R)),
				this._commandOptions?.typeMapping
			);
		}
		multi = this.MULTI;
		async close() {
			if (!this._self.#c && this._self.#d) {
				this._self.#c = !0;
				try {
					const R = [];
					for (const h of this._self.#o) R.push(h.close());
					for (const h of this._self.#l) R.push(h.close());
					(await Promise.all(R), this.#_?.onPoolClose(), this._self.#o.reset(), this._self.#l.reset());
				} catch {
				} finally {
					this._self.#c = !1;
				}
			}
		}
		destroy() {
			for (const R of this._self.#o) R.destroy();
			this._self.#o.reset();
			for (const R of this._self.#l) R.destroy();
			(this._self.#_?.onPoolClose(), this._self.#l.reset(), (this._self.#d = !1));
		}
	}
	return ((tt.RedisClientPool = _), tt);
}
const xU = '5.10.0',
	ZU = { version: xU };
var SC;
function Qr() {
	if (SC) return ut;
	SC = 1;
	var e =
			(ut && ut.__importDefault) ||
			function (D) {
				return D && D.__esModule ? D : { default: D };
			},
		r;
	Object.defineProperty(ut, '__esModule', { value: !0 });
	const n = e(je()),
		u = e(jU()),
		t = wU(),
		i = e(VU()),
		a = gr,
		s = Fe(),
		o = qe(),
		f = qD,
		d = Ud(),
		_ = e(_D()),
		c = e(FM()),
		R = WU(),
		h = ED(),
		S = L(),
		O = zr(),
		l = He(),
		E = e(al()),
		T = ZU,
		I = e(il());
	class P extends a.EventEmitter {
		static #e(m, A) {
			const N = (0, s.getTransformReply)(m, A);
			return async function (...C) {
				const y = new l.BasicCommandParser();
				return (m.parseCommand(y, ...C), this._self._executeCommand(m, y, this._commandOptions, N));
			};
		}
		static #t(m, A) {
			const N = (0, s.getTransformReply)(m, A);
			return async function (...C) {
				const y = new l.BasicCommandParser();
				return (m.parseCommand(y, ...C), this._self._executeCommand(m, y, this._self._commandOptions, N));
			};
		}
		static #r(m, A, N) {
			const C = (0, s.functionArgumentsPrefix)(m, A),
				y = (0, s.getTransformReply)(A, N);
			return async function (...b) {
				const U = new l.BasicCommandParser();
				return (U.push(...C), A.parseCommand(U, ...b), this._self._executeCommand(A, U, this._self._commandOptions, y));
			};
		}
		static #n(m, A) {
			const N = (0, s.scriptArgumentsPrefix)(m),
				C = (0, s.getTransformReply)(m, A);
			return async function (...y) {
				const b = new l.BasicCommandParser();
				return (b.push(...N), m.parseCommand(b, ...y), this._executeScript(m, b, this._commandOptions, C));
			};
		}
		static #s = new E.default();
		static factory(m) {
			let A = r.#s.get(m);
			return (
				A ||
					((A = (0, s.attachConfig)({
						BaseClass: r,
						commands: n.default,
						createCommand: r.#e,
						createModuleCommand: r.#t,
						createFunctionCommand: r.#r,
						createScriptCommand: r.#n,
						config: m
					})),
					(A.prototype.Multi = _.default.extend(m)),
					r.#s.set(m, A)),
				(N) => Object.create(new A(N))
			);
		}
		static create(m) {
			return r.factory(m)(m);
		}
		static parseOptions(m) {
			if (m?.url) {
				const A = r.parseURL(m.url);
				if (m.socket) {
					if (m.socket.tls !== void 0 && m.socket.tls !== A.socket.tls)
						throw new TypeError(`tls socket option is set to ${m.socket.tls} which is mismatch with protocol or the URL ${m.url} passed`);
					A.socket = Object.assign(m.socket, A.socket);
				}
				Object.assign(m, A);
			}
			return m;
		}
		static parseURL(m) {
			const { hostname: A, port: N, protocol: C, username: y, password: b, pathname: U } = new f.URL(m),
				B = { socket: { host: A, tls: !1 } };
			if (C !== 'redis:' && C !== 'rediss:') throw new TypeError('Invalid protocol');
			if (
				((B.socket.tls = C === 'rediss:'),
				N && (B.socket.port = Number(N)),
				y && (B.username = decodeURIComponent(y)),
				b && (B.password = decodeURIComponent(b)),
				(y || b) &&
					(B.credentialsProvider = {
						type: 'async-credentials-provider',
						credentials: async () => ({ username: y ? decodeURIComponent(y) : void 0, password: b ? decodeURIComponent(b) : void 0 })
					}),
				U.length > 1)
			) {
				const X = Number(U.substring(1));
				if (isNaN(X)) throw new TypeError('Invalid pathname');
				B.database = X;
			}
			return B;
		}
		#a;
		#u;
		#i;
		#o = 0;
		#l;
		_self = this;
		_commandOptions;
		#E;
		#d;
		#c;
		#_ = null;
		#S = !1;
		get clientSideCache() {
			return this._self.#c;
		}
		get options() {
			return this._self.#a;
		}
		get isOpen() {
			return this._self.#u.isOpen;
		}
		get isReady() {
			return this._self.#u.isReady;
		}
		get isPubSubActive() {
			return this._self.#i.isPubSubActive;
		}
		get socketEpoch() {
			return this._self.#u.socketEpoch;
		}
		get isWatching() {
			return this._self.#d !== void 0;
		}
		get isDirtyWatch() {
			return this._self.#E !== void 0;
		}
		setDirtyWatch(m) {
			this._self.#E = m;
		}
		constructor(m) {
			if (
				(super(),
				this.#R(m),
				(this.#a = this.#O(m)),
				(this.#i = this.#m()),
				(this.#u = this.#C()),
				this.#a.maintNotifications !== 'disabled' && new I.default(this.#i, this, this.#a),
				this.#a.clientSideCache)
			) {
				if (this.#a.clientSideCache instanceof O.ClientSideCacheProvider) this.#c = this.#a.clientSideCache;
				else {
					const A = this.#a.clientSideCache;
					this.#c = new O.BasicClientSideCache(A);
				}
				this.#i.addPushHandler((A) => {
					if (A[0].toString() !== 'invalidate') return !1;
					if (A[1] !== null) for (const N of A[1]) this.#c?.invalidate(N);
					else this.#c?.invalidate(null);
					return !0;
				});
			} else
				m?.emitInvalidate &&
					this.#i.addPushHandler((A) => {
						if (A[0].toString() !== 'invalidate') return !1;
						if (A[1] !== null) for (const N of A[1]) this.emit('invalidate', N);
						else this.emit('invalidate', null);
						return !0;
					});
		}
		#R(m) {
			if (m?.clientSideCache && m?.RESP !== 3) throw new Error('Client Side Caching is only supported with RESP3');
			if (m?.emitInvalidate && m?.RESP !== 3) throw new Error('emitInvalidate is only supported with RESP3');
			if (m?.clientSideCache && m?.emitInvalidate) throw new Error('emitInvalidate is not supported (or necessary) when clientSideCache is enabled');
			if (m?.maintNotifications && m?.maintNotifications !== 'disabled' && m?.RESP !== 3)
				throw new Error('Graceful Maintenance is only supported with RESP3');
		}
		#O(m = {}) {
			if (
				(!m.credentialsProvider &&
					(m.username || m.password) &&
					(m.credentialsProvider = { type: 'async-credentials-provider', credentials: async () => ({ username: m.username, password: m.password }) }),
				m.database && (this._self.#o = m.database),
				m.commandOptions && (this._commandOptions = m.commandOptions),
				m.maintNotifications !== 'disabled' && I.default.setupDefaultMaintOptions(m),
				m.url)
			) {
				const A = r.parseOptions(m);
				return (A?.database && (this._self.#o = A.database), A);
			}
			return m;
		}
		#m() {
			return new i.default(this.#a.RESP ?? 2, this.#a.commandsQueueMaxLength, (m, A) => this.emit('sharded-channel-moved', m, A));
		}
		reAuthenticate = async (m) => {
			(this.isPubSubActive && !this.#a.RESP) ||
				(await this.sendCommand((0, S.parseArgs)(n.default.AUTH, { username: m.username, password: m.password ?? '' })));
		};
		#h(m) {
			return m.subscribe({
				onNext: (A) => {
					this.reAuthenticate(A).catch((N) => {
						const C = N instanceof Error ? N.message : String(N);
						m.onReAuthenticationError(new t.CredentialsError(C));
					});
				},
				onError: (A) => {
					const N = `Error from streaming credentials provider: ${A.message}`;
					m.onReAuthenticationError(new t.UnableToObtainNewCredentialsError(N));
				}
			});
		}
		async #N(m, A) {
			const N = [],
				C = await this.#A();
			A && C.reverse();
			for (const { cmd: y, errorHandler: b } of C) N.push(this.#i.addCommand(y, { chainId: m, asap: A }).catch(b));
			return N;
		}
		async #A() {
			const m = [],
				A = this.#a.credentialsProvider;
			if (this.#a.RESP) {
				const C = {};
				if (A && A.type === 'async-credentials-provider') {
					const y = await A.credentials();
					y.password && (C.AUTH = { username: y.username ?? 'default', password: y.password });
				}
				if (A && A.type === 'streaming-credentials-provider') {
					const [y, b] = await this.#h(A);
					((this.#_ = b), y.password && (C.AUTH = { username: y.username ?? 'default', password: y.password }));
				}
				(this.#a.name && (C.SETNAME = this.#a.name), m.push({ cmd: (0, S.parseArgs)(c.default, this.#a.RESP, C) }));
			} else {
				if (A && A.type === 'async-credentials-provider') {
					const C = await A.credentials();
					(C.username || C.password) && m.push({ cmd: (0, S.parseArgs)(n.default.AUTH, { username: C.username, password: C.password ?? '' }) });
				}
				if (A && A.type === 'streaming-credentials-provider') {
					const [C, y] = await this.#h(A);
					((this.#_ = y),
						(C.username || C.password) && m.push({ cmd: (0, S.parseArgs)(n.default.AUTH, { username: C.username, password: C.password ?? '' }) }));
				}
				this.#a.name && m.push({ cmd: (0, S.parseArgs)(n.default.CLIENT_SETNAME, this.#a.name) });
			}
			(this.#o !== 0 && m.push({ cmd: ['SELECT', this.#o.toString()] }),
				this.#a.readonly && m.push({ cmd: (0, S.parseArgs)(n.default.READONLY) }),
				this.#a.disableClientInfo ||
					(m.push({ cmd: ['CLIENT', 'SETINFO', 'LIB-VER', T.version], errorHandler: () => {} }),
					m.push({
						cmd: ['CLIENT', 'SETINFO', 'LIB-NAME', this.#a.clientInfoTag ? `node-redis(${this.#a.clientInfoTag})` : 'node-redis'],
						errorHandler: () => {}
					})),
				this.#c && m.push({ cmd: this.#c.trackingOn() }),
				this.#a?.emitInvalidate && m.push({ cmd: ['CLIENT', 'TRACKING', 'ON'] }));
			const N = await I.default.getHandshakeCommand(this.#a);
			return (N && m.push(N), m);
		}
		#T(m) {
			m.on('data', (A) => {
				try {
					this.#i.decoder.write(A);
				} catch (N) {
					(this.#i.resetDecoder(), this.emit('error', N));
				}
			})
				.on('error', (A) => {
					(this.emit('error', A),
						this.#c?.onError(),
						this.#u.isOpen && !this.#a.disableOfflineQueue ? this.#i.flushWaitingForReply(A) : this.#i.flushAll(A));
				})
				.on('connect', () => this.emit('connect'))
				.on('ready', () => {
					(this.emit('ready'), this.#M(), this.#v());
				})
				.on('reconnecting', () => this.emit('reconnecting'))
				.on('drain', () => this.#v())
				.on('end', () => this.emit('end'));
		}
		#C() {
			const m = async () => {
					const N = [],
						C = Symbol('Socket Initiator'),
						y = this.#i.resubscribe(C);
					if (
						(y?.catch((b) => {
							b.message && b.message.startsWith('MOVED') && this.emit('__MOVED', this._self.#i.removeAllPubSubListeners());
						}),
						y && N.push(y),
						this.#l && N.push(this.#i.monitor(this.#l, { typeMapping: this._commandOptions?.typeMapping, chainId: C, asap: !0 })),
						N.push(...(await this.#N(C, !0))),
						N.length)
					)
						return (this.#y(), Promise.all(N));
				},
				A = new u.default(m, this.#a.socket);
			return (this.#T(A), A);
		}
		#f;
		#M() {
			!this.#a.pingInterval ||
				!this.#u.isReady ||
				(clearTimeout(this.#f),
				(this.#f = setTimeout(() => {
					this.#u.isReady &&
						this.sendCommand(['PING'])
							.then((m) => this.emit('ping-interval', m))
							.catch((m) => this.emit('error', m))
							.finally(() => this.#M());
				}, this.#a.pingInterval)));
		}
		withCommandOptions(m) {
			const A = Object.create(this._self);
			return ((A._commandOptions = m), A);
		}
		_commandOptionsProxy(m, A) {
			const N = Object.create(this._self);
			return ((N._commandOptions = Object.create(this._commandOptions ?? null)), (N._commandOptions[m] = A), N);
		}
		withTypeMapping(m) {
			return this._commandOptionsProxy('typeMapping', m);
		}
		withAbortSignal(m) {
			return this._commandOptionsProxy('abortSignal', m);
		}
		asap() {
			return this._commandOptionsProxy('asap', !0);
		}
		legacy() {
			return new R.RedisLegacyClient(this);
		}
		createPool(m) {
			return h.RedisClientPool.create(this._self.#a, m);
		}
		duplicate(m) {
			return new (Object.getPrototypeOf(this).constructor)({ ...this._self.#a, commandOptions: this._commandOptions, ...m });
		}
		async connect() {
			return (await this._self.#u.connect(), this);
		}
		_ejectSocket() {
			const m = this._self.#u;
			return ((this._self.#u = null), m.removeAllListeners(), m);
		}
		_insertSocket(m) {
			(this._self.#u && this._self._ejectSocket().destroy(), (this._self.#u = m), this._self.#T(this._self.#u));
		}
		_maintenanceUpdate(m) {
			(this._self.#u.setMaintenanceTimeout(m.relaxedSocketTimeout), this._self.#i.setMaintenanceCommandTimeout(m.relaxedCommandTimeout));
		}
		_pause() {
			this._self.#S = !0;
		}
		_unpause() {
			((this._self.#S = !1), this._self.#v());
		}
		async _executeCommand(m, A, N, C) {
			const y = this._self.#c,
				b = this._self.#a.commandOptions === N,
				U = () => this.sendCommand(A.redisArgs, N);
			if (y && m.CACHEABLE && b) return await y.handleCache(this._self, A, U, C, N?.typeMapping);
			{
				const B = await U();
				return C ? C(B, A.preserve, N?.typeMapping) : B;
			}
		}
		async _executeScript(m, A, N, C) {
			const y = A.redisArgs;
			let b;
			try {
				b = await this.sendCommand(y, N);
			} catch (U) {
				if (!U?.message?.startsWith?.('NOSCRIPT')) throw U;
				((y[0] = 'EVAL'), (y[1] = m.SCRIPT), (b = await this.sendCommand(y, N)));
			}
			return C ? C(b, A.preserve, N?.typeMapping) : b;
		}
		sendCommand(m, A) {
			if (this._self.#u.isOpen) {
				if (!this._self.#u.isReady && this._self.#a.disableOfflineQueue) return Promise.reject(new o.ClientOfflineError());
			} else return Promise.reject(new o.ClientClosedError());
			const N = { ...this._self._commandOptions, ...A },
				C = this._self.#i.addCommand(m, N);
			return (this._self.#I(), C);
		}
		async SELECT(m) {
			(await this.sendCommand(['SELECT', m.toString()]), (this._self.#o = m));
		}
		select = this.SELECT;
		#p(m) {
			return m === void 0 ? Promise.resolve() : (this.#I(), m);
		}
		SUBSCRIBE(m, A, N) {
			return this._self.#p(this._self.#i.subscribe(d.PUBSUB_TYPE.CHANNELS, m, A, N));
		}
		subscribe = this.SUBSCRIBE;
		UNSUBSCRIBE(m, A, N) {
			return this._self.#p(this._self.#i.unsubscribe(d.PUBSUB_TYPE.CHANNELS, m, A, N));
		}
		unsubscribe = this.UNSUBSCRIBE;
		PSUBSCRIBE(m, A, N) {
			return this._self.#p(this._self.#i.subscribe(d.PUBSUB_TYPE.PATTERNS, m, A, N));
		}
		pSubscribe = this.PSUBSCRIBE;
		PUNSUBSCRIBE(m, A, N) {
			return this._self.#p(this._self.#i.unsubscribe(d.PUBSUB_TYPE.PATTERNS, m, A, N));
		}
		pUnsubscribe = this.PUNSUBSCRIBE;
		SSUBSCRIBE(m, A, N) {
			return this._self.#p(this._self.#i.subscribe(d.PUBSUB_TYPE.SHARDED, m, A, N));
		}
		sSubscribe = this.SSUBSCRIBE;
		SUNSUBSCRIBE(m, A, N) {
			return this._self.#p(this._self.#i.unsubscribe(d.PUBSUB_TYPE.SHARDED, m, A, N));
		}
		sUnsubscribe = this.SUNSUBSCRIBE;
		async WATCH(m) {
			const A = await this._self.sendCommand((0, S.pushVariadicArguments)(['WATCH'], m));
			return ((this._self.#d ??= this._self.socketEpoch), A);
		}
		watch = this.WATCH;
		async UNWATCH() {
			const m = await this._self.sendCommand(['UNWATCH']);
			return ((this._self.#d = void 0), m);
		}
		unwatch = this.UNWATCH;
		getPubSubListeners(m) {
			return this._self.#i.getPubSubListeners(m);
		}
		extendPubSubChannelListeners(m, A, N) {
			return this._self.#p(this._self.#i.extendPubSubChannelListeners(m, A, N));
		}
		extendPubSubListeners(m, A) {
			return this._self.#p(this._self.#i.extendPubSubListeners(m, A));
		}
		#y() {
			this.#S || this.#u.write(this.#i.commandsToWrite());
		}
		#D;
		#I() {
			!this.#u.isReady ||
				this.#D ||
				(this.#D = setImmediate(() => {
					(this.#y(), (this.#D = void 0));
				}));
		}
		#v() {
			this.#i.isWaitingToWrite() && this.#I();
		}
		async _executePipeline(m, A) {
			if (!this._self.#u.isOpen) return Promise.reject(new o.ClientClosedError());
			const N = Symbol('Pipeline Chain'),
				C = Promise.all(m.map(({ args: b }) => this._self.#i.addCommand(b, { chainId: N, typeMapping: this._commandOptions?.typeMapping })));
			this._self.#I();
			const y = await C;
			return (A !== void 0 && (this._self.#o = A), y);
		}
		async _executeMulti(m, A) {
			const N = this._self.#E;
			this._self.#E = void 0;
			const C = this._self.#d;
			if (((this._self.#d = void 0), !this._self.#u.isOpen)) throw new o.ClientClosedError();
			if (N) throw new o.WatchError(N);
			if (C && C !== this._self.socketEpoch) throw new o.WatchError('Client reconnected after WATCH');
			const y = this._commandOptions?.typeMapping,
				b = Symbol('MULTI Chain'),
				U = [this._self.#i.addCommand(['MULTI'], { chainId: b })];
			for (const { args: x } of m) U.push(this._self.#i.addCommand(x, { chainId: b, typeMapping: y }));
			(U.push(this._self.#i.addCommand(['EXEC'], { chainId: b })), this._self.#I());
			const B = await Promise.all(U),
				X = B[B.length - 1];
			if (X === null) throw new o.WatchError();
			return (A !== void 0 && (this._self.#o = A), X);
		}
		MULTI() {
			return new this.Multi(this._executeMulti.bind(this), this._executePipeline.bind(this), this._commandOptions?.typeMapping);
		}
		multi = this.MULTI;
		async *scanIterator(m) {
			let A = m?.cursor ?? '0';
			do {
				const N = await this.scan(A, m);
				((A = N.cursor), yield N.keys);
			} while (A !== '0');
		}
		async *hScanIterator(m, A) {
			let N = A?.cursor ?? '0';
			do {
				const C = await this.hScan(m, N, A);
				((N = C.cursor), yield C.entries);
			} while (N !== '0');
		}
		async *hScanValuesIterator(m, A) {
			let N = A?.cursor ?? '0';
			do {
				const C = await this.hScanNoValues(m, N, A);
				((N = C.cursor), yield C.fields);
			} while (N !== '0');
		}
		async *hScanNoValuesIterator(m, A) {
			let N = A?.cursor ?? '0';
			do {
				const C = await this.hScanNoValues(m, N, A);
				((N = C.cursor), yield C.fields);
			} while (N !== '0');
		}
		async *sScanIterator(m, A) {
			let N = A?.cursor ?? '0';
			do {
				const C = await this.sScan(m, N, A);
				((N = C.cursor), yield C.members);
			} while (N !== '0');
		}
		async *zScanIterator(m, A) {
			let N = A?.cursor ?? '0';
			do {
				const C = await this.zScan(m, N, A);
				((N = C.cursor), yield C.members);
			} while (N !== '0');
		}
		async MONITOR(m) {
			const A = this._self.#i.monitor(m, { typeMapping: this._commandOptions?.typeMapping });
			(this._self.#I(), await A, (this._self.#l = m));
		}
		monitor = this.MONITOR;
		async reset() {
			const m = Symbol('Reset Chain'),
				A = [this._self.#i.reset(m)],
				N = this._self.#a?.database ?? 0;
			(this._self.#_?.dispose(),
				(this._self.#_ = null),
				A.push(...(await this._self.#N(m, !1))),
				this._self.#I(),
				await Promise.all(A),
				(this._self.#o = N),
				(this._self.#l = void 0),
				(this._self.#E = void 0),
				(this._self.#d = void 0));
		}
		resetIfDirty() {
			let m = !1;
			if (
				(this._self.#o !== (this._self.#a?.database ?? 0) && (console.warn('Returning a client with a different selected DB'), (m = !0)),
				this._self.#l && (console.warn('Returning a client with active MONITOR'), (m = !0)),
				this._self.#i.isPubSubActive && (console.warn('Returning a client with active PubSub'), (m = !0)),
				(this._self.#E || this._self.#d) && (console.warn('Returning a client with active WATCH'), (m = !0)),
				m)
			)
				return this.reset();
		}
		QUIT() {
			return (
				this._self.#_?.dispose(),
				(this._self.#_ = null),
				this._self.#u.quit(async () => {
					clearTimeout(this._self.#f);
					const m = this._self.#i.addCommand(['QUIT']);
					return (this._self.#I(), m);
				})
			);
		}
		quit = this.QUIT;
		disconnect() {
			return Promise.resolve(this.destroy());
		}
		close() {
			return new Promise((m) => {
				if ((clearTimeout(this._self.#f), this._self.#u.close(), this._self.#c?.onClose(), this._self.#i.isEmpty()))
					return (this._self.#u.destroySocket(), m());
				const A = () => {
					this._self.#i.isEmpty() && (this._self.#u.off('data', A), this._self.#u.destroySocket(), m());
				};
				(this._self.#u.on('data', A), this._self.#_?.dispose(), (this._self.#_ = null));
			});
		}
		destroy() {
			(clearTimeout(this._self.#f),
				this._self.#i.flushAll(new o.DisconnectsClientError()),
				this._self.#u.destroy(),
				this._self.#c?.onClose(),
				this._self.#_?.dispose(),
				(this._self.#_ = null));
		}
		ref() {
			this._self.#u.ref();
		}
		unref() {
			this._self.#u.unref();
		}
	}
	return ((r = P), (ut.default = P), ut);
}
var nr = {},
	ur = {},
	vo = { exports: {} },
	mC;
function JU() {
	if (mC) return vo.exports;
	mC = 1;
	var e = [
			0, 4129, 8258, 12387, 16516, 20645, 24774, 28903, 33032, 37161, 41290, 45419, 49548, 53677, 57806, 61935, 4657, 528, 12915, 8786, 21173, 17044,
			29431, 25302, 37689, 33560, 45947, 41818, 54205, 50076, 62463, 58334, 9314, 13379, 1056, 5121, 25830, 29895, 17572, 21637, 42346, 46411, 34088,
			38153, 58862, 62927, 50604, 54669, 13907, 9842, 5649, 1584, 30423, 26358, 22165, 18100, 46939, 42874, 38681, 34616, 63455, 59390, 55197, 51132,
			18628, 22757, 26758, 30887, 2112, 6241, 10242, 14371, 51660, 55789, 59790, 63919, 35144, 39273, 43274, 47403, 23285, 19156, 31415, 27286, 6769,
			2640, 14899, 10770, 56317, 52188, 64447, 60318, 39801, 35672, 47931, 43802, 27814, 31879, 19684, 23749, 11298, 15363, 3168, 7233, 60846, 64911,
			52716, 56781, 44330, 48395, 36200, 40265, 32407, 28342, 24277, 20212, 15891, 11826, 7761, 3696, 65439, 61374, 57309, 53244, 48923, 44858, 40793,
			36728, 37256, 33193, 45514, 41451, 53516, 49453, 61774, 57711, 4224, 161, 12482, 8419, 20484, 16421, 28742, 24679, 33721, 37784, 41979, 46042,
			49981, 54044, 58239, 62302, 689, 4752, 8947, 13010, 16949, 21012, 25207, 29270, 46570, 42443, 38312, 34185, 62830, 58703, 54572, 50445, 13538,
			9411, 5280, 1153, 29798, 25671, 21540, 17413, 42971, 47098, 34713, 38840, 59231, 63358, 50973, 55100, 9939, 14066, 1681, 5808, 26199, 30326,
			17941, 22068, 55628, 51565, 63758, 59695, 39368, 35305, 47498, 43435, 22596, 18533, 30726, 26663, 6336, 2273, 14466, 10403, 52093, 56156, 60223,
			64286, 35833, 39896, 43963, 48026, 19061, 23124, 27191, 31254, 2801, 6864, 10931, 14994, 64814, 60687, 56684, 52557, 48554, 44427, 40424, 36297,
			31782, 27655, 23652, 19525, 15522, 11395, 7392, 3265, 61215, 65342, 53085, 57212, 44955, 49082, 36825, 40952, 28183, 32310, 20053, 24180, 11923,
			16050, 3793, 7920
		],
		r = function (t) {
			for (var i, a = 0, s = 0, o = [], f = t.length; a < f; a++)
				((i = t.charCodeAt(a)),
					i < 128
						? (o[s++] = i)
						: i < 2048
							? ((o[s++] = (i >> 6) | 192), (o[s++] = (i & 63) | 128))
							: (i & 64512) === 55296 && a + 1 < t.length && (t.charCodeAt(a + 1) & 64512) === 56320
								? ((i = 65536 + ((i & 1023) << 10) + (t.charCodeAt(++a) & 1023)),
									(o[s++] = (i >> 18) | 240),
									(o[s++] = ((i >> 12) & 63) | 128),
									(o[s++] = ((i >> 6) & 63) | 128),
									(o[s++] = (i & 63) | 128))
								: ((o[s++] = (i >> 12) | 224), (o[s++] = ((i >> 6) & 63) | 128), (o[s++] = (i & 63) | 128)));
			return o;
		},
		n = (vo.exports = function (t) {
			for (var i, a = 0, s = -1, o = 0, f = 0, d = typeof t == 'string' ? r(t) : t, _ = d.length; a < _; ) {
				if (((i = d[a++]), s === -1)) i === 123 && (s = a);
				else if (i !== 125) f = e[(i ^ (f >> 8)) & 255] ^ (f << 8);
				else if (a - 1 !== s) return f & 16383;
				o = e[(i ^ (o >> 8)) & 255] ^ (o << 8);
			}
			return o & 16383;
		});
	return (
		(vo.exports.generateMulti = function (t) {
			for (var i = 1, a = t.length, s = n(t[0]); i < a; ) if (n(t[i++]) !== s) return -1;
			return s;
		}),
		vo.exports
	);
}
var OC;
function zU() {
	if (OC) return ur;
	OC = 1;
	var e =
			(ur && ur.__importDefault) ||
			function (o) {
				return o && o.__esModule ? o : { default: o };
			},
		r;
	Object.defineProperty(ur, '__esModule', { value: !0 });
	const n = qe(),
		u = e(Qr()),
		t = Ud(),
		i = e(JU()),
		a = zr();
	class s {
		static #e = 16384;
		#t;
		#r;
		#n;
		slots = new Array(r.#e);
		masters = new Array();
		replicas = new Array();
		nodeByAddress = new Map();
		pubSubNode;
		clientSideCache;
		#s = !1;
		get isOpen() {
			return this.#s;
		}
		#a(f) {
			if (f?.clientSideCache && f?.RESP !== 3) throw new Error('Client Side Caching is only supported with RESP3');
		}
		constructor(f, d) {
			(this.#a(f),
				(this.#t = f),
				f?.clientSideCache &&
					(f.clientSideCache instanceof a.PooledClientSideCacheProvider
						? (this.clientSideCache = f.clientSideCache)
						: (this.clientSideCache = new a.BasicPooledClientSideCache(f.clientSideCache))),
				(this.#r = u.default.factory(this.#t)),
				(this.#n = d));
		}
		async connect() {
			if (this.#s) throw new Error('Cluster already open');
			this.#s = !0;
			try {
				(await this.#u(), this.#n('connect'));
			} catch (f) {
				throw ((this.#s = !1), f);
			}
		}
		async #u() {
			let f = Math.floor(Math.random() * this.#t.rootNodes.length);
			for (let d = f; d < this.#t.rootNodes.length; d++) {
				if (!this.#s) throw new Error('Cluster closed');
				if (await this.#o(this.#t.rootNodes[d])) return;
			}
			for (let d = 0; d < f; d++) {
				if (!this.#s) throw new Error('Cluster closed');
				if (await this.#o(this.#t.rootNodes[d])) return;
			}
			throw new n.RootNodesUnavailableError();
		}
		#i() {
			((this.slots = new Array(r.#e)), (this.masters = []), (this.replicas = []), (this._randomNodeIterator = void 0));
		}
		async #o(f) {
			(this.clientSideCache?.clear(), this.clientSideCache?.disable());
			try {
				const d = new Set(),
					_ = [],
					c = this.#t.minimizeConnections !== !0,
					R = await this.#l(f);
				this.#i();
				for (const { from: h, to: S, master: O, replicas: l } of R) {
					const E = { master: this.#c(O, !1, c, d, _) };
					this.#t.useReplicas && (E.replicas = l.map((T) => this.#c(T, !0, c, d, _)));
					for (let T = h; T <= S; T++) this.slots[T] = E;
				}
				if (this.pubSubNode && !d.has(this.pubSubNode.address)) {
					const h = this.pubSubNode.client.getPubSubListeners(t.PUBSUB_TYPE.CHANNELS),
						S = this.pubSubNode.client.getPubSubListeners(t.PUBSUB_TYPE.PATTERNS);
					(this.pubSubNode.client.destroy(), (h.size || S.size) && _.push(this.#T({ [t.PUBSUB_TYPE.CHANNELS]: h, [t.PUBSUB_TYPE.PATTERNS]: S })));
				}
				for (const [h, S] of this.nodeByAddress.entries()) {
					if (d.has(h)) continue;
					S.client && S.client.destroy();
					const { pubSub: O } = S;
					(O && O.client.destroy(), this.nodeByAddress.delete(h));
				}
				return (await Promise.all(_), this.clientSideCache?.enable(), !0);
			} catch (d) {
				return (this.#n('error', d), !1);
			}
		}
		async #l(f) {
			const d = this.#d(f);
			((d.socket ??= {}), (d.socket.reconnectStrategy = !1), (d.RESP = this.#t.RESP), (d.commandOptions = void 0));
			const _ = await this.#r(d)
				.on('error', (c) => this.#n('error', c))
				.connect();
			try {
				return await _.clusterSlots();
			} finally {
				_.destroy();
			}
		}
		#E(f) {
			switch (typeof this.#t.nodeAddressMap) {
				case 'object':
					return this.#t.nodeAddressMap[f];
				case 'function':
					return this.#t.nodeAddressMap(f);
			}
		}
		#d(f) {
			if (!this.#t.defaults) return f;
			let d;
			return (
				this.#t.defaults.socket ? (d = { ...this.#t.defaults.socket, ...f?.socket }) : (d = f?.socket),
				{ ...this.#t.defaults, ...f, socket: d }
			);
		}
		#c(f, d, _, c, R) {
			const h = `${f.host}:${f.port}`;
			let S = this.nodeByAddress.get(h);
			return (
				S || ((S = { ...f, address: h, readonly: d, client: void 0, connectPromise: void 0 }), _ && R.push(this.#S(S)), this.nodeByAddress.set(h, S)),
				c.has(h) || (c.add(h), (d ? this.replicas : this.masters).push(S)),
				S
			);
		}
		#_(f, d = f.readonly) {
			const _ = this.#E(f.address) ?? { host: f.host, port: f.port },
				c = Object.freeze({ host: _.host, port: _.port }),
				R = this.#n,
				h = this.#r(this.#d({ clientSideCache: this.clientSideCache, RESP: this.#t.RESP, socket: _, readonly: d }))
					.on('error', (S) => R('node-error', S, c))
					.on('reconnecting', () => R('node-reconnecting', c))
					.once('ready', () => R('node-ready', c))
					.once('connect', () => R('node-connect', c))
					.once('end', () => R('node-disconnect', c))
					.on('__MOVED', async (S) => {
						(await this.rediscover(h), this.#n('__resubscribeAllPubSubListeners', S));
					});
			return h;
		}
		#S(f, d) {
			const _ = (f.client = this.#_(f, d));
			return (f.connectPromise = _.connect().finally(() => (f.connectPromise = void 0)));
		}
		nodeClient(f) {
			return f.connectPromise ?? f.client ?? this.#S(f);
		}
		#R;
		async rediscover(f) {
			return (
				(this.#R ??= this.#O(f).finally(() => {
					this.#R = void 0;
				})),
				this.#R
			);
		}
		async #O(f) {
			if (!(await this.#o(f.options))) return this.#u();
		}
		quit() {
			return this.#h((f) => f.quit());
		}
		disconnect() {
			return this.#h((f) => f.disconnect());
		}
		close() {
			return this.#h((f) => f.close());
		}
		destroy() {
			this.#s = !1;
			for (const f of this.#m()) f.destroy();
			(this.pubSubNode && (this.pubSubNode.client.destroy(), (this.pubSubNode = void 0)),
				this.#i(),
				this.nodeByAddress.clear(),
				this.#n('disconnect'));
		}
		*#m() {
			for (const f of this.masters) (f.client && (yield f.client), f.pubSub && (yield f.pubSub.client));
			for (const f of this.replicas) f.client && (yield f.client);
		}
		async #h(f) {
			this.#s = !1;
			const d = [];
			for (const _ of this.#m()) d.push(f(_));
			(this.pubSubNode && (d.push(f(this.pubSubNode.client)), (this.pubSubNode = void 0)),
				this.#i(),
				this.nodeByAddress.clear(),
				await Promise.allSettled(d),
				this.#n('disconnect'));
		}
		getClient(f, d) {
			if (!f) return this.nodeClient(this.getRandomNode());
			const _ = (0, i.default)(f);
			return d ? this.nodeClient(this.getSlotRandomNode(_)) : this.nodeClient(this.slots[_].master);
		}
		*#N() {
			if (this.masters.length + this.replicas.length === 0) return;
			let f = Math.floor(Math.random() * (this.masters.length + this.replicas.length));
			if (f < this.masters.length) {
				do yield this.masters[f];
				while (++f < this.masters.length);
				for (const d of this.replicas) yield d;
			} else {
				f -= this.masters.length;
				do yield this.replicas[f];
				while (++f < this.replicas.length);
			}
			for (;;) {
				for (const d of this.masters) yield d;
				for (const d of this.replicas) yield d;
			}
		}
		_randomNodeIterator;
		getRandomNode() {
			return ((this._randomNodeIterator ??= this.#N()), this._randomNodeIterator.next().value);
		}
		*#A(f) {
			let d = Math.floor(Math.random() * (1 + f.replicas.length));
			if (d < f.replicas.length)
				do yield f.replicas[d];
				while (++d < f.replicas.length);
			for (;;) {
				yield f.master;
				for (const _ of f.replicas) yield _;
			}
		}
		getSlotRandomNode(f) {
			const d = this.slots[f];
			return d.replicas?.length ? ((d.nodesIterator ??= this.#A(d)), d.nodesIterator.next().value) : d.master;
		}
		getMasterByAddress(f) {
			const d = this.nodeByAddress.get(f);
			if (d) return this.nodeClient(d);
		}
		getPubSubClient() {
			return this.pubSubNode ? (this.pubSubNode.connectPromise ?? this.pubSubNode.client) : this.#T();
		}
		async #T(f) {
			const d = Math.floor(Math.random() * (this.masters.length + this.replicas.length)),
				_ = d < this.masters.length ? this.masters[d] : this.replicas[d - this.masters.length],
				c = this.#_(_, !1);
			return (
				(this.pubSubNode = {
					address: _.address,
					client: c,
					connectPromise: c
						.connect()
						.then(
							async (R) => (
								f &&
									(await Promise.all([
										R.extendPubSubListeners(t.PUBSUB_TYPE.CHANNELS, f[t.PUBSUB_TYPE.CHANNELS]),
										R.extendPubSubListeners(t.PUBSUB_TYPE.PATTERNS, f[t.PUBSUB_TYPE.PATTERNS])
									])),
								(this.pubSubNode.connectPromise = void 0),
								R
							)
						)
						.catch((R) => {
							throw ((this.pubSubNode = void 0), R);
						})
				}),
				this.pubSubNode.connectPromise
			);
		}
		async executeUnsubscribeCommand(f) {
			const d = await this.getPubSubClient();
			(await f(d), d.isPubSubActive || (d.destroy(), (this.pubSubNode = void 0)));
		}
		getShardedPubSubClient(f) {
			const { master: d } = this.slots[(0, i.default)(f)];
			return d.pubSub ? (d.pubSub.connectPromise ?? d.pubSub.client) : this.#C(d);
		}
		async #C(f) {
			const d = this.#_(f, !1).on('server-sunsubscribe', async (_, c) => {
				try {
					(await this.rediscover(d), await (await this.getShardedPubSubClient(_)).extendPubSubChannelListeners(t.PUBSUB_TYPE.SHARDED, _, c));
				} catch (R) {
					this.#n('sharded-shannel-moved-error', R, _, c);
				}
			});
			return (
				(f.pubSub = {
					client: d,
					connectPromise: d
						.connect()
						.then((_) => ((f.pubSub.connectPromise = void 0), _))
						.catch((_) => {
							throw ((f.pubSub = void 0), _);
						})
				}),
				f.pubSub.connectPromise
			);
		}
		async executeShardedUnsubscribeCommand(f, d) {
			const { master: _ } = this.slots[(0, i.default)(f)];
			if (!_.pubSub) return;
			const c = _.pubSub.connectPromise ? await _.pubSub.connectPromise : _.pubSub.client;
			(await d(c), c.isPubSubActive || (c.destroy(), (_.pubSub = void 0)));
		}
	}
	return ((r = s), (ur.default = s), ur);
}
var ir = {},
	TC;
function QU() {
	if (TC) return ir;
	TC = 1;
	var e =
		(ir && ir.__importDefault) ||
		function (a) {
			return a && a.__esModule ? a : { default: a };
		};
	Object.defineProperty(ir, '__esModule', { value: !0 });
	const r = e(je()),
		n = e(Gd()),
		u = Fe(),
		t = He();
	class i {
		static #e(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				c.preserve = _.preserve;
				const R = _.firstKey;
				return this.addCommand(R, s.IS_READ_ONLY, c, f);
			};
		}
		static #t(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				c.preserve = _.preserve;
				const R = _.firstKey;
				return this._self.addCommand(R, s.IS_READ_ONLY, c, f);
			};
		}
		static #r(s, o, f) {
			const d = (0, u.functionArgumentsPrefix)(s, o),
				_ = (0, u.getTransformReply)(o, f);
			return function (...c) {
				const R = new t.BasicCommandParser();
				(R.push(...d), o.parseCommand(R, ...c));
				const h = R.redisArgs;
				h.preserve = R.preserve;
				const S = R.firstKey;
				return this._self.addCommand(S, o.IS_READ_ONLY, h, _);
			};
		}
		static #n(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				c.preserve = _.preserve;
				const R = _.firstKey;
				return this.#E(R, s.IS_READ_ONLY, s, c, f);
			};
		}
		static extend(s) {
			return (0, u.attachConfig)({
				BaseClass: i,
				commands: r.default,
				createCommand: i.#e,
				createModuleCommand: i.#t,
				createFunctionCommand: i.#r,
				createScriptCommand: i.#n,
				config: s
			});
		}
		#s;
		#a;
		#u;
		#i;
		#o = !0;
		constructor(s, o, f, d) {
			((this.#s = new n.default(d)), (this.#a = s), (this.#u = o), (this.#i = f));
		}
		#l(s, o) {
			((this.#i ??= s), (this.#o &&= o));
		}
		addCommand(s, o, f, d) {
			return (this.#l(s, o), this.#s.addCommand(f, d), this);
		}
		#E(s, o, f, d, _) {
			return (this.#l(s, o), this.#s.addScript(f, d, _), this);
		}
		async exec(s = !1) {
			return s ? this.execAsPipeline() : this.#s.transformReplies(await this.#a(this.#i, this.#o, this.#s.queue));
		}
		EXEC = this.exec;
		execTyped(s = !1) {
			return this.exec(s);
		}
		async execAsPipeline() {
			return this.#s.queue.length === 0 ? [] : this.#s.transformReplies(await this.#u(this.#i, this.#o, this.#s.queue));
		}
		execAsPipelineTyped() {
			return this.execAsPipeline();
		}
	}
	return ((ir.default = i), ir);
}
var AC;
function kU() {
	if (AC) return nr;
	AC = 1;
	var e =
		(nr && nr.__importDefault) ||
		function (_) {
			return _ && _.__esModule ? _ : { default: _ };
		};
	Object.defineProperty(nr, '__esModule', { value: !0 });
	const r = e(je()),
		n = gr,
		u = Fe(),
		t = e(zU()),
		i = e(QU()),
		a = qe(),
		s = He(),
		o = gM(),
		f = e(al());
	class d extends n.EventEmitter {
		static #e(c, R) {
			const h = (0, u.getTransformReply)(c, R);
			return async function (...S) {
				const O = new s.BasicCommandParser();
				return (
					c.parseCommand(O, ...S),
					this._self._execute(O.firstKey, c.IS_READ_ONLY, this._commandOptions, (l, E) => l._executeCommand(c, O, E, h))
				);
			};
		}
		static #t(c, R) {
			const h = (0, u.getTransformReply)(c, R);
			return async function (...S) {
				const O = new s.BasicCommandParser();
				return (
					c.parseCommand(O, ...S),
					this._self._execute(O.firstKey, c.IS_READ_ONLY, this._self._commandOptions, (l, E) => l._executeCommand(c, O, E, h))
				);
			};
		}
		static #r(c, R, h) {
			const S = (0, u.functionArgumentsPrefix)(c, R),
				O = (0, u.getTransformReply)(R, h);
			return async function (...l) {
				const E = new s.BasicCommandParser();
				return (
					E.push(...S),
					R.parseCommand(E, ...l),
					this._self._execute(E.firstKey, R.IS_READ_ONLY, this._self._commandOptions, (T, I) => T._executeCommand(R, E, I, O))
				);
			};
		}
		static #n(c, R) {
			const h = (0, u.scriptArgumentsPrefix)(c),
				S = (0, u.getTransformReply)(c, R);
			return async function (...O) {
				const l = new s.BasicCommandParser();
				return (
					l.push(...h),
					c.parseCommand(l, ...O),
					this._self._execute(l.firstKey, c.IS_READ_ONLY, this._commandOptions, (E, T) => E._executeScript(c, l, T, S))
				);
			};
		}
		static #s = new f.default();
		static factory(c) {
			let R = d.#s.get(c);
			return (
				R ||
					((R = (0, u.attachConfig)({
						BaseClass: d,
						commands: r.default,
						createCommand: d.#e,
						createModuleCommand: d.#t,
						createFunctionCommand: d.#r,
						createScriptCommand: d.#n,
						config: c
					})),
					(R.prototype.Multi = i.default.extend(c)),
					d.#s.set(c, R)),
				(h) => Object.create(new R(h))
			);
		}
		static create(c) {
			return d.factory(c)(c);
		}
		_options;
		_slots;
		_self = this;
		_commandOptions;
		get slots() {
			return this._self._slots.slots;
		}
		get clientSideCache() {
			return this._self._slots.clientSideCache;
		}
		get masters() {
			return this._self._slots.masters;
		}
		get replicas() {
			return this._self._slots.replicas;
		}
		get nodeByAddress() {
			return this._self._slots.nodeByAddress;
		}
		get pubSubNode() {
			return this._self._slots.pubSubNode;
		}
		get isOpen() {
			return this._self._slots.isOpen;
		}
		constructor(c) {
			(super(),
				(this._options = c),
				(this._slots = new t.default(c, this.emit.bind(this))),
				this.on('__resubscribeAllPubSubListeners', this.resubscribeAllPubSubListeners.bind(this)),
				c?.commandOptions && (this._commandOptions = c.commandOptions));
		}
		duplicate(c) {
			return new (Object.getPrototypeOf(this).constructor)({ ...this._self._options, commandOptions: this._commandOptions, ...c });
		}
		async connect() {
			return (await this._self._slots.connect(), this);
		}
		withCommandOptions(c) {
			const R = Object.create(this);
			return ((R._commandOptions = c), R);
		}
		_commandOptionsProxy(c, R) {
			const h = Object.create(this);
			return ((h._commandOptions = Object.create(this._commandOptions ?? null)), (h._commandOptions[c] = R), h);
		}
		withTypeMapping(c) {
			return this._commandOptionsProxy('typeMapping', c);
		}
		_handleAsk(c) {
			return async (R, h) => {
				const S = Symbol('asking chain'),
					O = h ? { ...h } : {};
				return ((O.chainId = S), (await Promise.all([R.sendCommand([o.ASKING_CMD], { chainId: S }), c(R, O)]))[1]);
			};
		}
		async _execute(c, R, h, S) {
			const O = this._options.maxCommandRedirections ?? 16;
			let l = await this._slots.getClient(c, R),
				E = 0,
				T = S;
			for (;;)
				try {
					return await T(l, h);
				} catch (I) {
					if (((T = S), ++E > O || !(I instanceof Error))) throw I;
					if (I.message.startsWith('ASK')) {
						const P = I.message.substring(I.message.lastIndexOf(' ') + 1);
						let D = await this._slots.getMasterByAddress(P);
						if ((D || (await this._slots.rediscover(l), (D = await this._slots.getMasterByAddress(P))), !D)) throw new Error(`Cannot find node ${P}`);
						((l = D), (T = this._handleAsk(S)));
						continue;
					}
					if (I.message.startsWith('MOVED')) {
						(await this._slots.rediscover(l), (l = await this._slots.getClient(c, R)));
						continue;
					}
					throw I;
				}
		}
		async sendCommand(c, R, h, S) {
			const O = { ...this._self._commandOptions, ...S };
			return this._self._execute(c, R, O, (l, E) => l.sendCommand(h, E));
		}
		MULTI(c) {
			return new this.Multi(
				async (R, h, S) => (await this._self._slots.getClient(R, h))._executeMulti(S),
				async (R, h, S) => (await this._self._slots.getClient(R, h))._executePipeline(S),
				c,
				this._commandOptions?.typeMapping
			);
		}
		multi = this.MULTI;
		async SUBSCRIBE(c, R, h) {
			return (await this._self._slots.getPubSubClient()).SUBSCRIBE(c, R, h);
		}
		subscribe = this.SUBSCRIBE;
		async UNSUBSCRIBE(c, R, h) {
			return this._self._slots.executeUnsubscribeCommand((S) => S.UNSUBSCRIBE(c, R, h));
		}
		unsubscribe = this.UNSUBSCRIBE;
		async PSUBSCRIBE(c, R, h) {
			return (await this._self._slots.getPubSubClient()).PSUBSCRIBE(c, R, h);
		}
		pSubscribe = this.PSUBSCRIBE;
		async PUNSUBSCRIBE(c, R, h) {
			return this._self._slots.executeUnsubscribeCommand((S) => S.PUNSUBSCRIBE(c, R, h));
		}
		pUnsubscribe = this.PUNSUBSCRIBE;
		async SSUBSCRIBE(c, R, h) {
			const S = this._self._options.maxCommandRedirections ?? 16,
				O = Array.isArray(c) ? c[0] : c;
			let l = await this._self._slots.getShardedPubSubClient(O);
			for (let E = 0; ; E++)
				try {
					return await l.SSUBSCRIBE(c, R, h);
				} catch (T) {
					if (++E > S || !(T instanceof a.ErrorReply)) throw T;
					if (T.message.startsWith('MOVED')) {
						(await this._self._slots.rediscover(l), (l = await this._self._slots.getShardedPubSubClient(O)));
						continue;
					}
					throw T;
				}
		}
		sSubscribe = this.SSUBSCRIBE;
		SUNSUBSCRIBE(c, R, h) {
			return this._self._slots.executeShardedUnsubscribeCommand(Array.isArray(c) ? c[0] : c, (S) => S.SUNSUBSCRIBE(c, R, h));
		}
		resubscribeAllPubSubListeners(c) {
			for (const [R, h] of c.CHANNELS)
				(h.buffers.forEach((S) => {
					this.subscribe(R, S, !0);
				}),
					h.strings.forEach((S) => {
						this.subscribe(R, S);
					}));
			for (const [R, h] of c.PATTERNS)
				(h.buffers.forEach((S) => {
					this.pSubscribe(R, S, !0);
				}),
					h.strings.forEach((S) => {
						this.pSubscribe(R, S);
					}));
			for (const [R, h] of c.SHARDED)
				(h.buffers.forEach((S) => {
					this.sSubscribe(R, S, !0);
				}),
					h.strings.forEach((S) => {
						this.sSubscribe(R, S);
					}));
		}
		sUnsubscribe = this.SUNSUBSCRIBE;
		quit() {
			return this._self._slots.quit();
		}
		disconnect() {
			return this._self._slots.disconnect();
		}
		close() {
			return (this._self._slots.clientSideCache?.onPoolClose(), this._self._slots.close());
		}
		destroy() {
			return (this._self._slots.clientSideCache?.onPoolClose(), this._self._slots.destroy());
		}
		nodeClient(c) {
			return this._self._slots.nodeClient(c);
		}
		getRandomNode() {
			return this._self._slots.getRandomNode();
		}
		getSlotRandomNode(c) {
			return this._self._slots.getSlotRandomNode(c);
		}
		getMasters() {
			return this.masters;
		}
		getSlotMaster(c) {
			return this.slots[c].master;
		}
	}
	return ((nr.default = d), nr);
}
var Oe = {},
	K = {},
	pC;
function $U() {
	if (pC) return K;
	((pC = 1),
		Object.defineProperty(K, '__esModule', { value: !0 }),
		(K.createScriptCommand =
			K.createModuleCommand =
			K.createFunctionCommand =
			K.createCommand =
			K.clientSocketToNode =
			K.createNodeList =
			K.parseNode =
				void 0));
	const e = He(),
		r = Fe();
	function n(f) {
		if (!(f.flags.includes('s_down') || f.flags.includes('disconnected') || f.flags.includes('failover_in_progress')))
			return { host: f.ip, port: Number(f.port) };
	}
	K.parseNode = n;
	function u(f) {
		var d = [];
		for (const _ of f) {
			const c = n(_);
			c !== void 0 && d.push(c);
		}
		return d;
	}
	K.createNodeList = u;
	function t(f) {
		const d = f;
		return { host: d.host, port: d.port };
	}
	K.clientSocketToNode = t;
	function i(f, d) {
		const _ = (0, r.getTransformReply)(f, d);
		return async function (...c) {
			const R = new e.BasicCommandParser();
			return (f.parseCommand(R, ...c), this._self._execute(f.IS_READ_ONLY, (h) => h._executeCommand(f, R, this.commandOptions, _)));
		};
	}
	K.createCommand = i;
	function a(f, d, _) {
		const c = (0, r.functionArgumentsPrefix)(f, d),
			R = (0, r.getTransformReply)(d, _);
		return async function (...h) {
			const S = new e.BasicCommandParser();
			return (
				S.push(...c),
				d.parseCommand(S, ...h),
				this._self._execute(d.IS_READ_ONLY, (O) => O._executeCommand(d, S, this._self.commandOptions, R))
			);
		};
	}
	K.createFunctionCommand = a;
	function s(f, d) {
		const _ = (0, r.getTransformReply)(f, d);
		return async function (...c) {
			const R = new e.BasicCommandParser();
			return (f.parseCommand(R, ...c), this._self._execute(f.IS_READ_ONLY, (h) => h._executeCommand(f, R, this._self.commandOptions, _)));
		};
	}
	K.createModuleCommand = s;
	function o(f, d) {
		const _ = (0, r.scriptArgumentsPrefix)(f),
			c = (0, r.getTransformReply)(f, d);
		return async function (...R) {
			const h = new e.BasicCommandParser();
			return (h.push(..._), f.parseCommand(h, ...R), this._self._execute(f.IS_READ_ONLY, (S) => S._executeScript(f, h, this.commandOptions, c)));
		};
	}
	return ((K.createScriptCommand = o), K);
}
var sr = {},
	NC;
function eG() {
	if (NC) return sr;
	NC = 1;
	var e =
		(sr && sr.__importDefault) ||
		function (a) {
			return a && a.__esModule ? a : { default: a };
		};
	Object.defineProperty(sr, '__esModule', { value: !0 });
	const r = e(je()),
		n = e(Gd()),
		u = Fe(),
		t = He();
	class i {
		static _createCommand(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				return ((c.preserve = _.preserve), this.addCommand(s.IS_READ_ONLY, c, f));
			};
		}
		static _createModuleCommand(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				return ((c.preserve = _.preserve), this._self.addCommand(s.IS_READ_ONLY, c, f));
			};
		}
		static _createFunctionCommand(s, o, f) {
			const d = (0, u.functionArgumentsPrefix)(s, o),
				_ = (0, u.getTransformReply)(o, f);
			return function (...c) {
				const R = new t.BasicCommandParser();
				(R.push(...d), o.parseCommand(R, ...c));
				const h = R.redisArgs;
				return ((h.preserve = R.preserve), this._self.addCommand(o.IS_READ_ONLY, h, _));
			};
		}
		static _createScriptCommand(s, o) {
			const f = (0, u.getTransformReply)(s, o);
			return function (...d) {
				const _ = new t.BasicCommandParser();
				s.parseCommand(_, ...d);
				const c = _.redisArgs;
				return ((c.preserve = _.preserve), this.#s(s.IS_READ_ONLY, s, c, f));
			};
		}
		static extend(s) {
			return (0, u.attachConfig)({
				BaseClass: i,
				commands: r.default,
				createCommand: i._createCommand,
				createModuleCommand: i._createModuleCommand,
				createFunctionCommand: i._createFunctionCommand,
				createScriptCommand: i._createScriptCommand,
				config: s
			});
		}
		#e = new n.default();
		#t;
		#r = !0;
		constructor(s, o) {
			((this.#e = new n.default(o)), (this.#t = s));
		}
		#n(s) {
			this.#r &&= s;
		}
		addCommand(s, o, f) {
			return (this.#n(s), this.#e.addCommand(o, f), this);
		}
		#s(s, o, f, d) {
			return (this.#n(s), this.#e.addScript(o, f, d), this);
		}
		async exec(s = !1) {
			return s ? this.execAsPipeline() : this.#e.transformReplies(await this.#t._executeMulti(this.#r, this.#e.queue));
		}
		EXEC = this.exec;
		execTyped(s = !1) {
			return this.exec(s);
		}
		async execAsPipeline() {
			return this.#e.queue.length === 0 ? [] : this.#e.transformReplies(await this.#t._executePipeline(this.#r, this.#e.queue));
		}
		execAsPipelineTyped() {
			return this.execAsPipeline();
		}
	}
	return ((sr.default = i), sr);
}
var rt = {},
	CC;
function tG() {
	if (CC) return rt;
	CC = 1;
	var e =
		(rt && rt.__importDefault) ||
		function (i) {
			return i && i.__esModule ? i : { default: i };
		};
	(Object.defineProperty(rt, '__esModule', { value: !0 }), (rt.PubSubProxy = void 0));
	const r = e(gr),
		n = Ud(),
		u = e(Qr());
	class t extends r.default {
		#e;
		#t;
		#r;
		#n;
		#s;
		constructor(a, s) {
			(super(), (this.#e = a), (this.#t = s));
		}
		#a() {
			if (this.#r === void 0) throw new Error("pubSubProxy: didn't define node to do pubsub against");
			return new u.default({ ...this.#e, socket: { ...this.#e.socket, host: this.#r.host, port: this.#r.port } });
		}
		async #u(a = !1) {
			const s = this.#a().on('error', this.#t),
				o = s
					.connect()
					.then(async (f) =>
						this.#n?.client !== f
							? (f.destroy(), this.#n?.connectPromise)
							: (a &&
									this.#s &&
									(await Promise.all([
										f.extendPubSubListeners(n.PUBSUB_TYPE.CHANNELS, this.#s[n.PUBSUB_TYPE.CHANNELS]),
										f.extendPubSubListeners(n.PUBSUB_TYPE.PATTERNS, this.#s[n.PUBSUB_TYPE.PATTERNS])
									])),
								this.#n.client !== f ? (f.destroy(), this.#n?.connectPromise) : ((this.#n.connectPromise = void 0), f))
					)
					.catch((f) => {
						throw ((this.#n = void 0), f);
					});
			return ((this.#n = { client: s, connectPromise: o }), o);
		}
		#i() {
			return this.#n ? (this.#n.connectPromise ?? this.#n.client) : this.#u();
		}
		async changeNode(a) {
			((this.#r = a),
				this.#n &&
					(this.#n.connectPromise === void 0 &&
						((this.#s = {
							[n.PUBSUB_TYPE.CHANNELS]: this.#n.client.getPubSubListeners(n.PUBSUB_TYPE.CHANNELS),
							[n.PUBSUB_TYPE.PATTERNS]: this.#n.client.getPubSubListeners(n.PUBSUB_TYPE.PATTERNS)
						}),
						this.#n.client.destroy()),
					await this.#u(!0)));
		}
		#o(a) {
			const s = this.#i();
			return s instanceof u.default
				? a(s)
				: s
						.then((o) => {
							if (o !== void 0) return a(o);
						})
						.catch((o) => {
							throw (this.#n?.client.isPubSubActive && (this.#n.client.destroy(), (this.#n = void 0)), o);
						});
		}
		subscribe(a, s, o) {
			return this.#o((f) => f.SUBSCRIBE(a, s, o));
		}
		#l(a) {
			return this.#o(async (s) => {
				const o = await a(s);
				return (s.isPubSubActive || (s.destroy(), (this.#n = void 0)), o);
			});
		}
		async unsubscribe(a, s, o) {
			return this.#l((f) => f.UNSUBSCRIBE(a, s, o));
		}
		async pSubscribe(a, s, o) {
			return this.#o((f) => f.PSUBSCRIBE(a, s, o));
		}
		async pUnsubscribe(a, s, o) {
			return this.#l((f) => f.PUNSUBSCRIBE(a, s, o));
		}
		destroy() {
			((this.#s = void 0), this.#n !== void 0 && (this.#n.connectPromise || this.#n.client.destroy(), (this.#n = void 0)));
		}
	}
	return ((rt.PubSubProxy = t), rt);
}
var ar = {},
	or = {},
	bo = {},
	IC;
function rG() {
	if (IC) return bo;
	((IC = 1), Object.defineProperty(bo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(bo.default = {
			parseCommand(r, n) {
				r.push('SENTINEL', 'MASTER', n);
			},
			transformReply: { 2: e.transformTuplesReply, 3: void 0 }
		}),
		bo
	);
}
var go = {},
	LC;
function nG() {
	return (
		LC ||
			((LC = 1),
			Object.defineProperty(go, '__esModule', { value: !0 }),
			(go.default = {
				parseCommand(e, r, n, u, t) {
					e.push('SENTINEL', 'MONITOR', r, n, u, t);
				},
				transformReply: void 0
			})),
		go
	);
}
var Uo = {},
	MC;
function uG() {
	if (MC) return Uo;
	((MC = 1), Object.defineProperty(Uo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Uo.default = {
			parseCommand(r, n) {
				r.push('SENTINEL', 'REPLICAS', n);
			},
			transformReply: {
				2: (r, n, u) => {
					const t = r,
						i = [];
					return t.reduce((a, s) => (a.push((0, e.transformTuplesReply)(s, void 0, u)), a), i);
				},
				3: void 0
			}
		}),
		Uo
	);
}
var Go = {},
	DC;
function iG() {
	if (DC) return Go;
	((DC = 1), Object.defineProperty(Go, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Go.default = {
			parseCommand(r, n) {
				r.push('SENTINEL', 'SENTINELS', n);
			},
			transformReply: {
				2: (r, n, u) => {
					const t = r,
						i = [];
					return t.reduce((a, s) => (a.push((0, e.transformTuplesReply)(s, void 0, u)), a), i);
				},
				3: void 0
			}
		}),
		Go
	);
}
var Yo = {},
	yC;
function sG() {
	return (
		yC ||
			((yC = 1),
			Object.defineProperty(Yo, '__esModule', { value: !0 }),
			(Yo.default = {
				parseCommand(e, r, n) {
					e.push('SENTINEL', 'SET', r);
					for (const u of n) e.push(u.option, u.value);
				},
				transformReply: void 0
			})),
		Yo
	);
}
var PC;
function aG() {
	if (PC) return or;
	PC = 1;
	var e =
		(or && or.__importDefault) ||
		function (a) {
			return a && a.__esModule ? a : { default: a };
		};
	Object.defineProperty(or, '__esModule', { value: !0 });
	const r = e(rG()),
		n = e(nG()),
		u = e(uG()),
		t = e(iG()),
		i = e(sG());
	return (
		(or.default = {
			SENTINEL_SENTINELS: t.default,
			sentinelSentinels: t.default,
			SENTINEL_MASTER: r.default,
			sentinelMaster: r.default,
			SENTINEL_REPLICAS: u.default,
			sentinelReplicas: u.default,
			SENTINEL_MONITOR: n.default,
			sentinelMonitor: n.default,
			SENTINEL_SET: i.default,
			sentinelSet: i.default
		}),
		or
	);
}
var vC;
function oG() {
	if (vC) return ar;
	vC = 1;
	var e =
		(ar && ar.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(ar, '__esModule', { value: !0 });
	const r = e(aG());
	return ((ar.default = { sentinel: r.default }), ar);
}
var Kr = {},
	bC;
function fG() {
	if (bC) return Kr;
	((bC = 1), Object.defineProperty(Kr, '__esModule', { value: !0 }), (Kr.WaitQueue = void 0));
	const e = sl();
	class r {
		#e = new e.SinglyLinkedList();
		#t = new e.SinglyLinkedList();
		push(u) {
			const t = this.#t.shift();
			if (t !== void 0) {
				t(u);
				return;
			}
			this.#e.push(u);
		}
		shift() {
			return this.#e.shift();
		}
		wait() {
			return new Promise((u) => this.#t.push(u));
		}
	}
	return ((Kr.WaitQueue = r), Kr);
}
var gC;
function dG() {
	if (gC) return Oe;
	gC = 1;
	var e =
		(Oe && Oe.__importDefault) ||
		function (O) {
			return O && O.__esModule ? O : { default: O };
		};
	(Object.defineProperty(Oe, '__esModule', { value: !0 }), (Oe.RedisSentinelFactory = Oe.RedisSentinelClient = void 0));
	const r = gr,
		n = e(Qr()),
		u = Fe(),
		t = e(je()),
		i = $U(),
		a = e(eG()),
		s = tG(),
		o = el,
		f = e(oG()),
		d = fG(),
		_ = zr();
	class c {
		#e;
		#t;
		_self;
		get isOpen() {
			return this._self.#t.isOpen;
		}
		get isReady() {
			return this._self.#t.isReady;
		}
		get commandOptions() {
			return this._self.#r;
		}
		#r;
		constructor(l, E, T) {
			((this._self = this), (this.#t = l), (this.#e = E), (this.#r = T));
		}
		static factory(l) {
			const E = (0, u.attachConfig)({
				BaseClass: c,
				commands: t.default,
				createCommand: i.createCommand,
				createModuleCommand: i.createModuleCommand,
				createFunctionCommand: i.createFunctionCommand,
				createScriptCommand: i.createScriptCommand,
				config: l
			});
			return ((E.prototype.Multi = a.default.extend(l)), (T, I, P) => Object.create(new E(T, I, P)));
		}
		static create(l, E, T, I) {
			return c.factory(l)(E, T, I);
		}
		withCommandOptions(l) {
			const E = Object.create(this);
			return ((E._commandOptions = l), E);
		}
		_commandOptionsProxy(l, E) {
			const T = Object.create(this);
			return ((T._commandOptions = Object.create(this._self.#r ?? null)), (T._commandOptions[l] = E), T);
		}
		withTypeMapping(l) {
			return this._commandOptionsProxy('typeMapping', l);
		}
		async _execute(l, E) {
			if (this._self.#e === void 0) throw new Error('Attempted execution on released RedisSentinelClient lease');
			return await this._self.#t.execute(E, this._self.#e);
		}
		async sendCommand(l, E, T) {
			return this._execute(l, (I) => I.sendCommand(E, T));
		}
		async _executePipeline(l, E) {
			return this._execute(l, (T) => T._executePipeline(E));
		}
		async _executeMulti(l, E) {
			return this._execute(l, (T) => T._executeMulti(E));
		}
		MULTI() {
			return new this.Multi(this);
		}
		multi = this.MULTI;
		WATCH(l) {
			if (this._self.#e === void 0) throw new Error('Attempted execution on released RedisSentinelClient lease');
			return this._execute(!1, (E) => E.watch(l));
		}
		watch = this.WATCH;
		UNWATCH() {
			if (this._self.#e === void 0) throw new Error('Attempted execution on released RedisSentinelClient lease');
			return this._execute(!1, (l) => l.unwatch());
		}
		unwatch = this.UNWATCH;
		release() {
			if (this._self.#e === void 0) throw new Error('RedisSentinelClient lease already released');
			const l = this._self.#t.releaseClientLease(this._self.#e);
			return ((this._self.#e = void 0), l);
		}
	}
	Oe.RedisSentinelClient = c;
	class R extends r.EventEmitter {
		_self;
		#e;
		#t;
		get isOpen() {
			return this._self.#e.isOpen;
		}
		get isReady() {
			return this._self.#e.isReady;
		}
		get commandOptions() {
			return this._self.#r;
		}
		#r;
		#n = () => {};
		#s;
		#a = 0;
		#u;
		get clientSideCache() {
			return this._self.#e.clientSideCache;
		}
		constructor(l) {
			(super(),
				(this._self = this),
				(this.#t = l),
				l.commandOptions && (this.#r = l.commandOptions),
				(this.#e = new h(l)),
				this.#e.on('error', (E) => this.emit('error', E)),
				this.#e.on('topology-change', (E) => {
					this.emit('topology-change', E) || this._self.#n(`RedisSentinel: re-emit for topology-change for ${E.type} event returned false`);
				}));
		}
		static factory(l) {
			const E = (0, u.attachConfig)({
				BaseClass: R,
				commands: t.default,
				createCommand: i.createCommand,
				createModuleCommand: i.createModuleCommand,
				createFunctionCommand: i.createFunctionCommand,
				createScriptCommand: i.createScriptCommand,
				config: l
			});
			return ((E.prototype.Multi = a.default.extend(l)), (T) => Object.create(new E(T)));
		}
		static create(l) {
			return R.factory(l)(l);
		}
		withCommandOptions(l) {
			const E = Object.create(this);
			return ((E._commandOptions = l), E);
		}
		_commandOptionsProxy(l, E) {
			const T = Object.create(this);
			return ((T._self.#r = { ...(this._self.#r || {}), [l]: E }), T);
		}
		withTypeMapping(l) {
			return this._commandOptionsProxy('typeMapping', l);
		}
		async connect() {
			return (await this._self.#e.connect(), this._self.#t.reserveClient && (this._self.#s = await this._self.#e.getClientLease()), this);
		}
		async _execute(l, E) {
			let T;
			(!l || !this._self.#e.useReplicas) &&
				(this._self.#s ? (T = this._self.#s) : ((this._self.#u ??= await this._self.#e.getClientLease()), (T = this._self.#u), this._self.#a++));
			try {
				return await this._self.#e.execute(E, T);
			} finally {
				if (T !== void 0 && T === this._self.#u && --this._self.#a === 0) {
					const I = this._self.#e.releaseClientLease(T);
					((this._self.#u = void 0), I && (await I));
				}
			}
		}
		async use(l) {
			const E = await this._self.#e.getClientLease();
			try {
				return await l(c.create(this._self.#t, this._self.#e, E, this._self.#r));
			} finally {
				const T = this._self.#e.releaseClientLease(E);
				T && (await T);
			}
		}
		async sendCommand(l, E, T) {
			return this._execute(l, (I) => I.sendCommand(E, T));
		}
		async _executePipeline(l, E) {
			return this._execute(l, (T) => T._executePipeline(E));
		}
		async _executeMulti(l, E) {
			return this._execute(l, (T) => T._executeMulti(E));
		}
		MULTI() {
			return new this.Multi(this);
		}
		multi = this.MULTI;
		async close() {
			return this._self.#e.close();
		}
		destroy() {
			return this._self.#e.destroy();
		}
		async SUBSCRIBE(l, E, T) {
			return this._self.#e.subscribe(l, E, T);
		}
		subscribe = this.SUBSCRIBE;
		async UNSUBSCRIBE(l, E, T) {
			return this._self.#e.unsubscribe(l, E, T);
		}
		unsubscribe = this.UNSUBSCRIBE;
		async PSUBSCRIBE(l, E, T) {
			return this._self.#e.pSubscribe(l, E, T);
		}
		pSubscribe = this.PSUBSCRIBE;
		async PUNSUBSCRIBE(l, E, T) {
			return this._self.#e.pUnsubscribe(l, E, T);
		}
		pUnsubscribe = this.PUNSUBSCRIBE;
		async acquire() {
			const l = await this._self.#e.getClientLease();
			return c.create(this._self.#t, this._self.#e, l, this._self.#r);
		}
		getSentinelNode() {
			return this._self.#e.getSentinelNode();
		}
		getMasterNode() {
			return this._self.#e.getMasterNode();
		}
		getReplicaNodes() {
			return this._self.#e.getReplicaNodes();
		}
		setTracer(l) {
			(l
				? (this._self.#n = (E) => {
						l.push(E);
					})
				: (this._self.#n = () => {}),
				this._self.#e.setTracer(l));
		}
	}
	Oe.default = R;
	class h extends r.EventEmitter {
		#e = !1;
		get isOpen() {
			return this.#e;
		}
		#t = !1;
		get isReady() {
			return this.#t;
		}
		#r;
		#n;
		#s;
		#a;
		#u;
		#i;
		#o = !1;
		#l = 0;
		#E;
		#d;
		#c = [];
		#_;
		#S;
		#R = [];
		#O = 0;
		#m;
		get useReplicas() {
			return this.#m > 0;
		}
		#h;
		#N;
		#A;
		#T;
		#C = !1;
		#f = () => {};
		#M;
		get clientSideCache() {
			return this.#M;
		}
		#p(l) {
			if (l?.clientSideCache && l?.RESP !== 3) throw new Error('Client Side Caching is only supported with RESP3');
		}
		constructor(l) {
			if (
				(super(),
				this.#p(l),
				(this.#r = l.name),
				(this.#i = l.RESP),
				(this.#E = Array.from(l.sentinelRootNodes)),
				(this.#N = l.maxCommandRediscovers ?? 16),
				(this.#S = l.masterPoolSize ?? 1),
				(this.#m = l.replicaPoolSize ?? 0),
				(this.#a = l.scanInterval ?? 0),
				(this.#u = l.passthroughClientErrorEvents ?? !1),
				(this.#n = l.nodeClientOptions ? { ...l.nodeClientOptions } : {}),
				this.#n.url !== void 0)
			)
				throw new Error('invalid nodeClientOptions for Sentinel');
			if (l.clientSideCache)
				if (l.clientSideCache instanceof _.PooledClientSideCacheProvider) this.#M = this.#n.clientSideCache = l.clientSideCache;
				else {
					const E = l.clientSideCache;
					this.#M = this.#n.clientSideCache = new _.BasicPooledClientSideCache(E);
				}
			if (
				((this.#s = l.sentinelClientOptions ? Object.assign({}, l.sentinelClientOptions) : {}), (this.#s.modules = f.default), this.#s.url !== void 0)
			)
				throw new Error('invalid sentinelClientOptions for Sentinel');
			this.#_ = new d.WaitQueue();
			for (let E = 0; E < this.#S; E++) this.#_.push(E);
			this.#A = new s.PubSubProxy(this.#n, (E) => this.emit('error', E));
		}
		#y(l, E, T) {
			return n.default.create({
				RESP: this.#i,
				...E,
				socket: { ...E.socket, host: l.host, port: l.port, ...(T !== void 0 && { reconnectStrategy: T }) }
			});
		}
		getClientLease() {
			const l = this.#_.shift();
			return l !== void 0 ? { id: l } : this.#_.wait().then((E) => ({ id: E }));
		}
		releaseClientLease(l) {
			const E = this.#c[l.id];
			if (E !== void 0) {
				const T = E.resetIfDirty();
				if (T) return T.then(() => this.#_.push(l.id));
			}
			this.#_.push(l.id);
		}
		async connect() {
			if (this.#e) throw new Error('already attempting to open');
			try {
				((this.#e = !0), (this.#h = this.#D()), await this.#h, (this.#t = !0));
			} finally {
				((this.#h = void 0), this.#a > 0 && (this.#T = setInterval(this.#L.bind(this), this.#a)));
			}
		}
		async #D() {
			let l = 0;
			for (;;) {
				if ((this.#f('starting connect loop'), (l += 1), this.#C)) {
					this.#f('in #connect and want to destroy');
					return;
				}
				try {
					if (((this.#o = !1), await this.transform(this.analyze(await this.observe())), this.#o)) {
						this.#f('#connect: anotherReset is true, so continuing');
						continue;
					}
					this.#f('#connect: returning');
					return;
				} catch (E) {
					if ((this.#f(`#connect: exception ${E.message}`), !this.#t && l > this.#N)) throw E;
					(E.message !== 'no valid master node' && console.log(E), await (0, o.setTimeout)(1e3));
				} finally {
					this.#f('finished connect');
				}
			}
		}
		async execute(l, E) {
			let T = 0;
			for (;;) {
				this.#h !== void 0 && (await this.#h);
				const I = this.#Y(E);
				if (!I.isReady) {
					await this.#L();
					continue;
				}
				const P = I.options?.socket;
				this.#f('attemping to send command to ' + P?.host + ':' + P?.port);
				try {
					return await l(I);
				} catch (D) {
					if (++T > this.#N || !(D instanceof Error)) throw D;
					if (E !== void 0 && (D.message.startsWith('READONLY') || !I.isReady)) {
						await this.#L();
						continue;
					}
					throw D;
				}
			}
		}
		async #I(l) {
			return (
				await l.pSubscribe(
					['switch-master', '[-+]sdown', '+slave', '+sentinel', '[-+]odown', '+slave-reconf-done'],
					(E, T) => {
						this.#v(T, E);
					},
					!0
				),
				l
			);
		}
		async #v(l, E) {
			(this.#f('pubsub control channel message on ' + l), this.#L());
		}
		#Y(l) {
			if (l !== void 0) return this.#c[l.id];
			if ((this.#O >= this.#R.length && (this.#O = 0), this.#R.length == 0)) throw new Error('no replicas available for read');
			return this.#R[this.#O++];
		}
		async #L() {
			if (!(this.#t == !1 || this.#C == !0)) {
				if (this.#h !== void 0) return ((this.#o = !0), await this.#h);
				try {
					return ((this.#h = this.#D()), await this.#h);
				} finally {
					(this.#f('finished reconfgure'), (this.#h = void 0));
				}
			}
		}
		#b(l) {
			const E = this.#E.findIndex((T) => T.host === l.host && T.port === l.port);
			(E !== -1 && this.#E.splice(E, 1), this.#L());
		}
		async close() {
			((this.#C = !0),
				this.#h != null && (await this.#h),
				(this.#t = !1),
				this.#M?.onPoolClose(),
				this.#T && (clearInterval(this.#T), (this.#T = void 0)));
			const l = [];
			this.#d !== void 0 && (this.#d.isOpen && l.push(this.#d.close()), (this.#d = void 0));
			for (const E of this.#c) E.isOpen && l.push(E.close());
			this.#c = [];
			for (const E of this.#R) E.isOpen && l.push(E.close());
			((this.#R = []), await Promise.all(l), this.#A.destroy(), (this.#e = !1));
		}
		async destroy() {
			((this.#C = !0),
				this.#h != null && (await this.#h),
				(this.#t = !1),
				this.#M?.onPoolClose(),
				this.#T && (clearInterval(this.#T), (this.#T = void 0)),
				this.#d !== void 0 && (this.#d.isOpen && this.#d.destroy(), (this.#d = void 0)));
			for (const l of this.#c) l.isOpen && l.destroy();
			this.#c = [];
			for (const l of this.#R) l.isOpen && l.destroy();
			((this.#R = []), this.#A.destroy(), (this.#e = !1), (this.#C = !1));
		}
		async subscribe(l, E, T) {
			return this.#A.subscribe(l, E, T);
		}
		async unsubscribe(l, E, T) {
			return this.#A.unsubscribe(l, E, T);
		}
		async pSubscribe(l, E, T) {
			return this.#A.pSubscribe(l, E, T);
		}
		async pUnsubscribe(l, E, T) {
			return this.#A.pUnsubscribe(l, E, T);
		}
		async observe() {
			for (const l of this.#E) {
				let E;
				try {
					(this.#f(`observe: trying to connect to sentinel: ${l.host}:${l.port}`),
						(E = this.#y(l, this.#s, !1)),
						E.on('error', (m) => this.emit('error', `obseve client error: ${m}`)),
						await E.connect(),
						this.#f('observe: connected to sentinel'));
					const [T, I, P] = await Promise.all([
						E.sentinel.sentinelSentinels(this.#r),
						E.sentinel.sentinelMaster(this.#r),
						E.sentinel.sentinelReplicas(this.#r)
					]);
					return (
						this.#f('observe: got all sentinel data'),
						{
							sentinelConnected: l,
							sentinelData: T,
							masterData: I,
							replicaData: P,
							currentMaster: this.getMasterNode(),
							currentReplicas: this.getReplicaNodes(),
							currentSentinel: this.getSentinelNode(),
							replicaPoolSize: this.#m,
							useReplicas: this.useReplicas
						}
					);
				} catch (T) {
					(this.#f(`observe: error ${T}`), this.emit('error', T));
				} finally {
					E !== void 0 && E.isOpen && (this.#f('observe: destroying sentinel client'), E.destroy());
				}
			}
			throw (this.#f('observe: none of the sentinels are available'), new Error('None of the sentinels are available'));
		}
		analyze(l) {
			let E = (0, i.parseNode)(l.masterData);
			if (E === void 0) throw (this.#f(`analyze: no valid master node because ${l.masterData.flags}`), new Error('no valid master node'));
			E.host === l.currentMaster?.host && E.port === l.currentMaster?.port
				? (this.#f(`analyze: master node hasn't changed from ${l.currentMaster?.host}:${l.currentMaster?.port}`), (E = void 0))
				: this.#f(`analyze: master node has changed to ${E.host}:${E.port} from ${l.currentMaster?.host}:${l.currentMaster?.port}`);
			let T = l.sentinelConnected;
			T.host === l.currentSentinel?.host && T.port === l.currentSentinel.port
				? (this.#f("analyze: sentinel node hasn't changed"), (T = void 0))
				: this.#f(`analyze: sentinel node has changed to ${T.host}:${T.port}`);
			const I = [],
				P = new Map(),
				D = new Set(),
				m = new Set();
			if (l.useReplicas) {
				const N = (0, i.createNodeList)(l.replicaData);
				for (const C of N) D.add(JSON.stringify(C));
				for (const [C, y] of l.currentReplicas)
					D.has(JSON.stringify(C))
						? (m.add(JSON.stringify(C)),
							y != l.replicaPoolSize && (P.set(C, l.replicaPoolSize - y), this.#f(`analyze: adding ${C.host}:${C.port} to replicsToOpen`)))
						: (I.push(C), this.#f(`analyze: adding ${C.host}:${C.port} to replicsToClose`));
				for (const C of N) m.has(JSON.stringify(C)) || (P.set(C, l.replicaPoolSize), this.#f(`analyze: adding ${C.host}:${C.port} to replicsToOpen`));
			}
			return {
				sentinelList: [l.sentinelConnected].concat((0, i.createNodeList)(l.sentinelData)),
				epoch: Number(l.masterData['config-epoch']),
				sentinelToOpen: T,
				masterToOpen: E,
				replicasToClose: I,
				replicasToOpen: P
			};
		}
		async transform(l) {
			this.#f('transform: enter');
			let E = [];
			if (l.sentinelToOpen) {
				(this.#f('transform: opening a new sentinel'),
					this.#d !== void 0 && this.#d.isOpen
						? (this.#f('transform: destroying old sentinel as open'), this.#d.destroy(), (this.#d = void 0))
						: this.#f('transform: not destroying old sentinel as not open'),
					this.#f(`transform: creating new sentinel to ${l.sentinelToOpen.host}:${l.sentinelToOpen.port}`));
				const D = l.sentinelToOpen,
					m = this.#y(l.sentinelToOpen, this.#s, !1);
				(m
					.on('error', (C) => {
						this.#u && this.emit('error', new Error(`Sentinel Client (${D.host}:${D.port}): ${C.message}`, { cause: C }));
						const y = { type: 'SENTINEL', node: (0, i.clientSocketToNode)(m.options.socket), error: C };
						(this.emit('client-error', y), this.#b(D));
					})
					.on('end', () => this.#b(D)),
					(this.#d = m),
					this.#f('transform: adding sentinel client connect() to promise list'));
				const A = this.#d.connect().then((C) => this.#I(C));
				(E.push(A), this.#f(`created sentinel client to ${l.sentinelToOpen.host}:${l.sentinelToOpen.port}`));
				const N = { type: 'SENTINEL_CHANGE', node: l.sentinelToOpen };
				(this.#f('transform: emiting topology-change event for sentinel_change'),
					this.emit('topology-change', N) || this.#f('transform: emit for topology-change for sentinel_change returned false'));
			}
			if (l.masterToOpen) {
				this.#f('transform: opening a new master');
				const D = [],
					m = [];
				this.#f('transform: destroying old masters if open');
				for (const N of this.#c) (m.push(N.isWatching || N.isDirtyWatch), N.isOpen && N.destroy());
				((this.#c = []), this.#f('transform: creating all master clients and adding connect promises'));
				for (let N = 0; N < this.#S; N++) {
					const C = l.masterToOpen,
						y = this.#y(l.masterToOpen, this.#n);
					(y.on('error', (b) => {
						this.#u && this.emit('error', new Error(`Master Client (${C.host}:${C.port}): ${b.message}`, { cause: b }));
						const U = { type: 'MASTER', node: (0, i.clientSocketToNode)(y.options.socket), error: b };
						this.emit('client-error', U);
					}),
						m[N] && y.setDirtyWatch('sentinel config changed in middle of a WATCH Transaction'),
						this.#c.push(y),
						D.push(y.connect()),
						this.#f(`created master client to ${l.masterToOpen.host}:${l.masterToOpen.port}`));
				}
				(this.#f('transform: adding promise to change #pubSubProxy node'), D.push(this.#A.changeNode(l.masterToOpen)), E.push(...D));
				const A = { type: 'MASTER_CHANGE', node: l.masterToOpen };
				(this.#f('transform: emiting topology-change event for master_change'),
					this.emit('topology-change', A) || this.#f('transform: emit for topology-change for master_change returned false'),
					this.#l++);
			}
			const T = new Set();
			for (const D of l.replicasToClose) {
				const m = JSON.stringify(D);
				T.add(m);
			}
			const I = [],
				P = new Set();
			for (const D of this.#R) {
				const m = (0, i.clientSocketToNode)(D.options.socket),
					A = JSON.stringify(m);
				if (T.has(A) || !D.isOpen) {
					if (D.isOpen) {
						const N = D.options?.socket;
						(this.#f(`destroying replica client to ${N?.host}:${N?.port}`), D.destroy());
					}
					if (!P.has(A)) {
						const N = { type: 'REPLICA_REMOVE', node: m };
						(this.emit('topology-change', N), P.add(A));
					}
				} else I.push(D);
			}
			if (((this.#R = I), l.replicasToOpen.size != 0))
				for (const [D, m] of l.replicasToOpen) {
					for (let N = 0; N < m; N++) {
						const C = this.#y(D, this.#n);
						(C.on('error', (y) => {
							this.#u && this.emit('error', new Error(`Replica Client (${D.host}:${D.port}): ${y.message}`, { cause: y }));
							const b = { type: 'REPLICA', node: (0, i.clientSocketToNode)(C.options.socket), error: y };
							this.emit('client-error', b);
						}),
							this.#R.push(C),
							E.push(C.connect()),
							this.#f(`created replica client to ${D.host}:${D.port}`));
					}
					const A = { type: 'REPLICA_ADD', node: D };
					this.emit('topology-change', A);
				}
			if (l.sentinelList.length != this.#E.length) {
				this.#E = l.sentinelList;
				const D = { type: 'SENTINE_LIST_CHANGE', size: l.sentinelList.length };
				this.emit('topology-change', D);
			}
			(await Promise.all(E), this.#f('transform: exit'));
		}
		getMasterNode() {
			if (this.#c.length != 0) {
				for (const l of this.#c) if (l.isReady) return (0, i.clientSocketToNode)(l.options.socket);
			}
		}
		getSentinelNode() {
			if (this.#d !== void 0) return (0, i.clientSocketToNode)(this.#d.options.socket);
		}
		getReplicaNodes() {
			const l = new Map(),
				E = new Map();
			for (const T of this.#R) {
				const I = (0, i.clientSocketToNode)(T.options.socket),
					P = JSON.stringify(I);
				T.isReady ? E.set(P, (E.get(P) ?? 0) + 1) : E.has(P) || E.set(P, 0);
			}
			for (const [T, I] of E) l.set(JSON.parse(T), I);
			return l;
		}
		setTracer(l) {
			l
				? (this.#f = (E) => {
						l.push(E);
					})
				: (this.#f = () => {});
		}
	}
	class S extends r.EventEmitter {
		options;
		#e;
		#t = -1;
		constructor(l) {
			(super(), (this.options = l), (this.#e = l.sentinelRootNodes));
		}
		async updateSentinelRootNodes() {
			for (const l of this.#e) {
				const E = n.default
					.create({
						...this.options.sentinelClientOptions,
						socket: { ...this.options.sentinelClientOptions?.socket, host: l.host, port: l.port, reconnectStrategy: !1 },
						modules: f.default
					})
					.on('error', (T) => this.emit(`updateSentinelRootNodes: ${T}`));
				try {
					await E.connect();
				} catch {
					E.isOpen && E.destroy();
					continue;
				}
				try {
					const T = await E.sentinel.sentinelSentinels(this.options.name);
					this.#e = [l].concat((0, i.createNodeList)(T));
					return;
				} finally {
					E.destroy();
				}
			}
			throw new Error("Couldn't connect to any sentinel node");
		}
		async getMasterNode() {
			let l = !1;
			for (const E of this.#e) {
				const T = n.default
					.create({
						...this.options.sentinelClientOptions,
						socket: { ...this.options.sentinelClientOptions?.socket, host: E.host, port: E.port, reconnectStrategy: !1 },
						modules: f.default
					})
					.on('error', (I) => this.emit(`getMasterNode: ${I}`));
				try {
					await T.connect();
				} catch {
					T.isOpen && T.destroy();
					continue;
				}
				l = !0;
				try {
					const I = await T.sentinel.sentinelMaster(this.options.name);
					let P = (0, i.parseNode)(I);
					if (P === void 0) continue;
					return P;
				} finally {
					T.destroy();
				}
			}
			throw l ? new Error('Master Node Not Enumerated') : new Error("couldn't connect to any sentinels");
		}
		async getMasterClient() {
			const l = await this.getMasterNode();
			return n.default.create({
				...this.options.nodeClientOptions,
				socket: { ...this.options.nodeClientOptions?.socket, host: l.host, port: l.port }
			});
		}
		async getReplicaNodes() {
			let l = !1;
			for (const E of this.#e) {
				const T = n.default
					.create({
						...this.options.sentinelClientOptions,
						socket: { ...this.options.sentinelClientOptions?.socket, host: E.host, port: E.port, reconnectStrategy: !1 },
						modules: f.default
					})
					.on('error', (I) => this.emit(`getReplicaNodes: ${I}`));
				try {
					await T.connect();
				} catch {
					T.isOpen && T.destroy();
					continue;
				}
				l = !0;
				try {
					const I = await T.sentinel.sentinelReplicas(this.options.name),
						P = (0, i.createNodeList)(I);
					if (P.length == 0) continue;
					return P;
				} finally {
					T.destroy();
				}
			}
			throw l ? new Error('No Replicas Nodes Enumerated') : new Error("couldn't connect to any sentinels");
		}
		async getReplicaClient() {
			const l = await this.getReplicaNodes();
			if (l.length == 0) throw new Error('no available replicas');
			return (
				this.#t++,
				this.#t >= l.length && (this.#t = 0),
				n.default.create({
					...this.options.nodeClientOptions,
					socket: { ...this.options.nodeClientOptions?.socket, host: l[this.#t].host, port: l[this.#t].port }
				})
			);
		}
	}
	return ((Oe.RedisSentinelFactory = S), Oe);
}
var UC;
function yd() {
	return (
		UC ||
			((UC = 1),
			(function (e) {
				var r =
						(Ge && Ge.__createBinding) ||
						(Object.create
							? function (h, S, O, l) {
									l === void 0 && (l = O);
									var E = Object.getOwnPropertyDescriptor(S, O);
									((!E || ('get' in E ? !S.__esModule : E.writable || E.configurable)) &&
										(E = {
											enumerable: !0,
											get: function () {
												return S[O];
											}
										}),
										Object.defineProperty(h, l, E));
								}
							: function (h, S, O, l) {
									(l === void 0 && (l = O), (h[l] = S[O]));
								}),
					n =
						(Ge && Ge.__exportStar) ||
						function (h, S) {
							for (var O in h) O !== 'default' && !Object.prototype.hasOwnProperty.call(S, O) && r(S, h, O);
						},
					u =
						(Ge && Ge.__importDefault) ||
						function (h) {
							return h && h.__esModule ? h : { default: h };
						};
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.BasicPooledClientSideCache =
						e.BasicClientSideCache =
						e.REDIS_FLUSH_MODES =
						e.COMMAND_LIST_FILTER_BY =
						e.CLUSTER_SLOT_STATES =
						e.FAILOVER_MODES =
						e.CLIENT_KILL_FILTERS =
						e.GEO_REPLY_WITH =
						e.createSentinel =
						e.createCluster =
						e.createClientPool =
						e.createClient =
						e.defineScript =
						e.VerbatimString =
						e.RESP_TYPES =
							void 0));
				var t = tl();
				Object.defineProperty(e, 'RESP_TYPES', {
					enumerable: !0,
					get: function () {
						return t.RESP_TYPES;
					}
				});
				var i = vM();
				Object.defineProperty(e, 'VerbatimString', {
					enumerable: !0,
					get: function () {
						return i.VerbatimString;
					}
				});
				var a = FD();
				(Object.defineProperty(e, 'defineScript', {
					enumerable: !0,
					get: function () {
						return a.defineScript;
					}
				}),
					n(qe(), e));
				const s = u(Qr());
				e.createClient = s.default.create;
				const o = ED();
				e.createClientPool = o.RedisClientPool.create;
				const f = u(kU());
				e.createCluster = f.default.create;
				const d = u(dG());
				e.createSentinel = d.default.create;
				var _ = vd();
				Object.defineProperty(e, 'GEO_REPLY_WITH', {
					enumerable: !0,
					get: function () {
						return _.GEO_REPLY_WITH;
					}
				});
				var c = je();
				(Object.defineProperty(e, 'CLIENT_KILL_FILTERS', {
					enumerable: !0,
					get: function () {
						return c.CLIENT_KILL_FILTERS;
					}
				}),
					Object.defineProperty(e, 'FAILOVER_MODES', {
						enumerable: !0,
						get: function () {
							return c.FAILOVER_MODES;
						}
					}),
					Object.defineProperty(e, 'CLUSTER_SLOT_STATES', {
						enumerable: !0,
						get: function () {
							return c.CLUSTER_SLOT_STATES;
						}
					}),
					Object.defineProperty(e, 'COMMAND_LIST_FILTER_BY', {
						enumerable: !0,
						get: function () {
							return c.COMMAND_LIST_FILTER_BY;
						}
					}),
					Object.defineProperty(e, 'REDIS_FLUSH_MODES', {
						enumerable: !0,
						get: function () {
							return c.REDIS_FLUSH_MODES;
						}
					}));
				var R = zr();
				(Object.defineProperty(e, 'BasicClientSideCache', {
					enumerable: !0,
					get: function () {
						return R.BasicClientSideCache;
					}
				}),
					Object.defineProperty(e, 'BasicPooledClientSideCache', {
						enumerable: !0,
						get: function () {
							return R.BasicPooledClientSideCache;
						}
					}));
			})(Ge)),
		Ge
	);
}
var wr = {},
	fr = {},
	Ye = {},
	Bo = {},
	GC;
function lG() {
	if (GC) return Bo;
	((GC = 1), Object.defineProperty(Bo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Bo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('BF.ADD'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		Bo
	);
}
var qo = {},
	YC;
function cG() {
	return (
		YC ||
			((YC = 1),
			Object.defineProperty(qo, '__esModule', { value: !0 }),
			(qo.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('BF.CARD'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		qo
	);
}
var Ho = {},
	BC;
function _G() {
	if (BC) return Ho;
	((BC = 1), Object.defineProperty(Ho, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Ho.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('BF.EXISTS'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		Ho
	);
}
var jo = {},
	Xr = {},
	qC;
function RD() {
	if (qC) return Xr;
	((qC = 1), Object.defineProperty(Xr, '__esModule', { value: !0 }), (Xr.transformInfoV2Reply = void 0));
	const e = yd();
	function r(n, u) {
		switch (u ? u[e.RESP_TYPES.MAP] : void 0) {
			case Array:
				return n;
			case Map: {
				const i = new Map();
				for (let a = 0; a < n.length; a += 2) i.set(n[a].toString(), n[a + 1]);
				return i;
			}
			default: {
				const i = Object.create(null);
				for (let a = 0; a < n.length; a += 2) i[n[a].toString()] = n[a + 1];
				return i;
			}
		}
	}
	return ((Xr.transformInfoV2Reply = r), Xr);
}
var HC;
function EG() {
	if (HC) return jo;
	((HC = 1), Object.defineProperty(jo, '__esModule', { value: !0 }));
	const e = RD();
	return (
		(jo.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('BF.INFO'), r.pushKey(n));
			},
			transformReply: { 2: (r, n, u) => (0, e.transformInfoV2Reply)(r, u), 3: void 0 }
		}),
		jo
	);
}
var Fo = {},
	jC;
function RG() {
	if (jC) return Fo;
	((jC = 1), Object.defineProperty(Fo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Fo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('BF.INSERT'),
					r.pushKey(n),
					t?.CAPACITY !== void 0 && r.push('CAPACITY', t.CAPACITY.toString()),
					t?.ERROR !== void 0 && r.push('ERROR', t.ERROR.toString()),
					t?.EXPANSION !== void 0 && r.push('EXPANSION', t.EXPANSION.toString()),
					t?.NOCREATE && r.push('NOCREATE'),
					t?.NONSCALING && r.push('NONSCALING'),
					r.push('ITEMS'),
					r.pushVariadic(u));
			},
			transformReply: e.transformBooleanArrayReply
		}),
		Fo
	);
}
var Ko = {},
	FC;
function hG() {
	return (
		FC ||
			((FC = 1),
			Object.defineProperty(Ko, '__esModule', { value: !0 }),
			(Ko.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('BF.LOADCHUNK'), e.pushKey(r), e.push(n.toString(), u));
				},
				transformReply: void 0
			})),
		Ko
	);
}
var wo = {},
	KC;
function SG() {
	if (KC) return wo;
	((KC = 1), Object.defineProperty(wo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(wo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('BF.MADD'), r.pushKey(n), r.pushVariadic(u));
			},
			transformReply: e.transformBooleanArrayReply
		}),
		wo
	);
}
var Xo = {},
	wC;
function mG() {
	if (wC) return Xo;
	((wC = 1), Object.defineProperty(Xo, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Xo.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('BF.MEXISTS'), r.pushKey(n), r.pushVariadic(u));
			},
			transformReply: e.transformBooleanArrayReply
		}),
		Xo
	);
}
var Vo = {},
	XC;
function OG() {
	return (
		XC ||
			((XC = 1),
			Object.defineProperty(Vo, '__esModule', { value: !0 }),
			(Vo.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t) {
					(e.push('BF.RESERVE'),
						e.pushKey(r),
						e.push(n.toString(), u.toString()),
						t?.EXPANSION && e.push('EXPANSION', t.EXPANSION.toString()),
						t?.NONSCALING && e.push('NONSCALING'));
				},
				transformReply: void 0
			})),
		Vo
	);
}
var Wo = {},
	VC;
function TG() {
	return (
		VC ||
			((VC = 1),
			Object.defineProperty(Wo, '__esModule', { value: !0 }),
			(Wo.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('BF.SCANDUMP'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply(e) {
					return { iterator: e[0], chunk: e[1] };
				}
			})),
		Wo
	);
}
var WC;
function kr() {
	return (
		WC ||
			((WC = 1),
			(function (e) {
				var r =
						(Ye && Ye.__createBinding) ||
						(Object.create
							? function (h, S, O, l) {
									l === void 0 && (l = O);
									var E = Object.getOwnPropertyDescriptor(S, O);
									((!E || ('get' in E ? !S.__esModule : E.writable || E.configurable)) &&
										(E = {
											enumerable: !0,
											get: function () {
												return S[O];
											}
										}),
										Object.defineProperty(h, l, E));
								}
							: function (h, S, O, l) {
									(l === void 0 && (l = O), (h[l] = S[O]));
								}),
					n =
						(Ye && Ye.__exportStar) ||
						function (h, S) {
							for (var O in h) O !== 'default' && !Object.prototype.hasOwnProperty.call(S, O) && r(S, h, O);
						},
					u =
						(Ye && Ye.__importDefault) ||
						function (h) {
							return h && h.__esModule ? h : { default: h };
						};
				Object.defineProperty(e, '__esModule', { value: !0 });
				const t = u(lG()),
					i = u(cG()),
					a = u(_G()),
					s = u(EG()),
					o = u(RG()),
					f = u(hG()),
					d = u(SG()),
					_ = u(mG()),
					c = u(OG()),
					R = u(TG());
				(n(RD(), e),
					(e.default = {
						ADD: t.default,
						add: t.default,
						CARD: i.default,
						card: i.default,
						EXISTS: a.default,
						exists: a.default,
						INFO: s.default,
						info: s.default,
						INSERT: o.default,
						insert: o.default,
						LOADCHUNK: f.default,
						loadChunk: f.default,
						MADD: d.default,
						mAdd: d.default,
						MEXISTS: _.default,
						mExists: _.default,
						RESERVE: c.default,
						reserve: c.default,
						SCANDUMP: R.default,
						scanDump: R.default
					}));
			})(Ye)),
		Ye
	);
}
var dr = {},
	xo = {},
	xC;
function AG() {
	if (xC) return xo;
	((xC = 1),
		Object.defineProperty(xo, '__esModule', { value: !0 }),
		(xo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				if ((r.push('CMS.INCRBY'), r.pushKey(n), Array.isArray(u))) for (const t of u) e(r, t);
				else e(r, u);
			},
			transformReply: void 0
		}));
	function e(r, { item: n, incrementBy: u }) {
		r.push(n, u.toString());
	}
	return xo;
}
var Zo = {},
	ZC;
function pG() {
	if (ZC) return Zo;
	((ZC = 1), Object.defineProperty(Zo, '__esModule', { value: !0 }));
	const e = kr();
	return (
		(Zo.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('CMS.INFO'), r.pushKey(n));
			},
			transformReply: { 2: (r, n, u) => (0, e.transformInfoV2Reply)(r, u), 3: void 0 }
		}),
		Zo
	);
}
var Jo = {},
	JC;
function NG() {
	return (
		JC ||
			((JC = 1),
			Object.defineProperty(Jo, '__esModule', { value: !0 }),
			(Jo.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('CMS.INITBYDIM'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		Jo
	);
}
var zo = {},
	zC;
function CG() {
	return (
		zC ||
			((zC = 1),
			Object.defineProperty(zo, '__esModule', { value: !0 }),
			(zo.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('CMS.INITBYPROB'), e.pushKey(r), e.push(n.toString(), u.toString()));
				},
				transformReply: void 0
			})),
		zo
	);
}
var Qo = {},
	QC;
function IG() {
	if (QC) return Qo;
	((QC = 1),
		Object.defineProperty(Qo, '__esModule', { value: !0 }),
		(Qo.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				if ((r.push('CMS.MERGE'), r.pushKey(n), r.push(u.length.toString()), e(u))) r.pushVariadic(u);
				else {
					for (let t = 0; t < u.length; t++) r.push(u[t].name);
					r.push('WEIGHTS');
					for (let t = 0; t < u.length; t++) r.push(u[t].weight.toString());
				}
			},
			transformReply: void 0
		}));
	function e(r) {
		return typeof r[0] == 'string' || r[0] instanceof Buffer;
	}
	return Qo;
}
var ko = {},
	kC;
function LG() {
	return (
		kC ||
			((kC = 1),
			Object.defineProperty(ko, '__esModule', { value: !0 }),
			(ko.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('CMS.QUERY'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		ko
	);
}
var $C;
function MG() {
	if ($C) return dr;
	$C = 1;
	var e =
		(dr && dr.__importDefault) ||
		function (s) {
			return s && s.__esModule ? s : { default: s };
		};
	Object.defineProperty(dr, '__esModule', { value: !0 });
	const r = e(AG()),
		n = e(pG()),
		u = e(NG()),
		t = e(CG()),
		i = e(IG()),
		a = e(LG());
	return (
		(dr.default = {
			INCRBY: r.default,
			incrBy: r.default,
			INFO: n.default,
			info: n.default,
			INITBYDIM: u.default,
			initByDim: u.default,
			INITBYPROB: t.default,
			initByProb: t.default,
			MERGE: i.default,
			merge: i.default,
			QUERY: a.default,
			query: a.default
		}),
		dr
	);
}
var lr = {},
	$o = {},
	eI;
function DG() {
	if (eI) return $o;
	((eI = 1), Object.defineProperty($o, '__esModule', { value: !0 }));
	const e = L();
	return (
		($o.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('CF.ADD'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		$o
	);
}
var ef = {},
	tI;
function yG() {
	if (tI) return ef;
	((tI = 1), Object.defineProperty(ef, '__esModule', { value: !0 }));
	const e = L();
	return (
		(ef.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('CF.ADDNX'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		ef
	);
}
var tf = {},
	rI;
function PG() {
	return (
		rI ||
			((rI = 1),
			Object.defineProperty(tf, '__esModule', { value: !0 }),
			(tf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('CF.COUNT'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		tf
	);
}
var rf = {},
	nI;
function vG() {
	if (nI) return rf;
	((nI = 1), Object.defineProperty(rf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(rf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('CF.DEL'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		rf
	);
}
var nf = {},
	uI;
function bG() {
	if (uI) return nf;
	((uI = 1), Object.defineProperty(nf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(nf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('CF.EXISTS'), r.pushKey(n), r.push(u));
			},
			transformReply: e.transformBooleanReply
		}),
		nf
	);
}
var uf = {},
	iI;
function gG() {
	if (iI) return uf;
	((iI = 1), Object.defineProperty(uf, '__esModule', { value: !0 }));
	const e = kr();
	return (
		(uf.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('CF.INFO'), r.pushKey(n));
			},
			transformReply: { 2: (r, n, u) => (0, e.transformInfoV2Reply)(r, u), 3: void 0 }
		}),
		uf
	);
}
var cr = {},
	sI;
function hD() {
	if (sI) return cr;
	((sI = 1), Object.defineProperty(cr, '__esModule', { value: !0 }), (cr.parseCfInsertArguments = void 0));
	const e = L();
	function r(n, u, t, i) {
		(n.pushKey(u),
			i?.CAPACITY !== void 0 && n.push('CAPACITY', i.CAPACITY.toString()),
			i?.NOCREATE && n.push('NOCREATE'),
			n.push('ITEMS'),
			n.pushVariadic(t));
	}
	return (
		(cr.parseCfInsertArguments = r),
		(cr.default = {
			IS_READ_ONLY: !1,
			parseCommand(...n) {
				(n[0].push('CF.INSERT'), r(...n));
			},
			transformReply: e.transformBooleanArrayReply
		}),
		cr
	);
}
var Te = {},
	aI;
function UG() {
	if (aI) return Te;
	aI = 1;
	var e =
			(Te && Te.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Te && Te.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Te && Te.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Te, '__esModule', { value: !0 });
	const u = n(hD());
	return (
		(Te.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(...t) {
				(t[0].push('CF.INSERTNX'), (0, u.parseCfInsertArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		Te
	);
}
var sf = {},
	oI;
function GG() {
	return (
		oI ||
			((oI = 1),
			Object.defineProperty(sf, '__esModule', { value: !0 }),
			(sf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('CF.LOADCHUNK'), e.pushKey(r), e.push(n.toString(), u));
				},
				transformReply: void 0
			})),
		sf
	);
}
var af = {},
	fI;
function YG() {
	return (
		fI ||
			((fI = 1),
			Object.defineProperty(af, '__esModule', { value: !0 }),
			(af.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('CF.RESERVE'),
						e.pushKey(r),
						e.push(n.toString()),
						u?.BUCKETSIZE !== void 0 && e.push('BUCKETSIZE', u.BUCKETSIZE.toString()),
						u?.MAXITERATIONS !== void 0 && e.push('MAXITERATIONS', u.MAXITERATIONS.toString()),
						u?.EXPANSION !== void 0 && e.push('EXPANSION', u.EXPANSION.toString()));
				},
				transformReply: void 0
			})),
		af
	);
}
var of = {},
	dI;
function BG() {
	return (
		dI ||
			((dI = 1),
			Object.defineProperty(of, '__esModule', { value: !0 }),
			(of.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('CF.SCANDUMP'), e.pushKey(r), e.push(n.toString()));
				},
				transformReply(e) {
					return { iterator: e[0], chunk: e[1] };
				}
			})),
		of
	);
}
var lI;
function qG() {
	if (lI) return lr;
	lI = 1;
	var e =
		(lr && lr.__importDefault) ||
		function (c) {
			return c && c.__esModule ? c : { default: c };
		};
	Object.defineProperty(lr, '__esModule', { value: !0 });
	const r = e(DG()),
		n = e(yG()),
		u = e(PG()),
		t = e(vG()),
		i = e(bG()),
		a = e(gG()),
		s = e(hD()),
		o = e(UG()),
		f = e(GG()),
		d = e(YG()),
		_ = e(BG());
	return (
		(lr.default = {
			ADD: r.default,
			add: r.default,
			ADDNX: n.default,
			addNX: n.default,
			COUNT: u.default,
			count: u.default,
			DEL: t.default,
			del: t.default,
			EXISTS: i.default,
			exists: i.default,
			INFO: a.default,
			info: a.default,
			INSERT: s.default,
			insert: s.default,
			INSERTNX: o.default,
			insertNX: o.default,
			LOADCHUNK: f.default,
			loadChunk: f.default,
			RESERVE: d.default,
			reserve: d.default,
			SCANDUMP: _.default,
			scanDump: _.default
		}),
		lr
	);
}
var _r = {},
	ff = {},
	cI;
function HG() {
	return (
		cI ||
			((cI = 1),
			Object.defineProperty(ff, '__esModule', { value: !0 }),
			(ff.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('TDIGEST.ADD'), e.pushKey(r));
					for (const u of n) e.push(u.toString());
				},
				transformReply: void 0
			})),
		ff
	);
}
var Er = {},
	_I;
function SD() {
	if (_I) return Er;
	((_I = 1), Object.defineProperty(Er, '__esModule', { value: !0 }), (Er.transformByRankArguments = void 0));
	const e = L();
	function r(n, u, t) {
		n.pushKey(u);
		for (const i of t) n.push(i.toString());
	}
	return (
		(Er.transformByRankArguments = r),
		(Er.default = {
			IS_READ_ONLY: !0,
			parseCommand(...n) {
				(n[0].push('TDIGEST.BYRANK'), r(...n));
			},
			transformReply: e.transformDoubleArrayReply
		}),
		Er
	);
}
var Ae = {},
	EI;
function jG() {
	if (EI) return Ae;
	EI = 1;
	var e =
			(Ae && Ae.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Ae && Ae.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Ae && Ae.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Ae, '__esModule', { value: !0 });
	const u = n(SD());
	return (
		(Ae.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(...t) {
				(t[0].push('TDIGEST.BYREVRANK'), (0, u.transformByRankArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		Ae
	);
}
var df = {},
	RI;
function FG() {
	if (RI) return df;
	((RI = 1), Object.defineProperty(df, '__esModule', { value: !0 }));
	const e = L();
	return (
		(df.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('TDIGEST.CDF'), r.pushKey(n));
				for (const t of u) r.push(t.toString());
			},
			transformReply: e.transformDoubleArrayReply
		}),
		df
	);
}
var lf = {},
	hI;
function KG() {
	return (
		hI ||
			((hI = 1),
			Object.defineProperty(lf, '__esModule', { value: !0 }),
			(lf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('TDIGEST.CREATE'), e.pushKey(r), n?.COMPRESSION !== void 0 && e.push('COMPRESSION', n.COMPRESSION.toString()));
				},
				transformReply: void 0
			})),
		lf
	);
}
var cf = {},
	SI;
function wG() {
	if (SI) return cf;
	((SI = 1), Object.defineProperty(cf, '__esModule', { value: !0 }));
	const e = kr();
	return (
		(cf.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('TDIGEST.INFO'), r.pushKey(n));
			},
			transformReply: { 2: (r, n, u) => (0, e.transformInfoV2Reply)(r, u), 3: void 0 }
		}),
		cf
	);
}
var _f = {},
	mI;
function XG() {
	if (mI) return _f;
	((mI = 1), Object.defineProperty(_f, '__esModule', { value: !0 }));
	const e = L();
	return (
		(_f.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('TDIGEST.MAX'), r.pushKey(n));
			},
			transformReply: e.transformDoubleReply
		}),
		_f
	);
}
var Ef = {},
	OI;
function VG() {
	return (
		OI ||
			((OI = 1),
			Object.defineProperty(Ef, '__esModule', { value: !0 }),
			(Ef.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('TDIGEST.MERGE'),
						e.pushKey(r),
						e.pushKeysLength(n),
						u?.COMPRESSION !== void 0 && e.push('COMPRESSION', u.COMPRESSION.toString()),
						u?.OVERRIDE && e.push('OVERRIDE'));
				},
				transformReply: void 0
			})),
		Ef
	);
}
var Rf = {},
	TI;
function WG() {
	if (TI) return Rf;
	((TI = 1), Object.defineProperty(Rf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Rf.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('TDIGEST.MIN'), r.pushKey(n));
			},
			transformReply: e.transformDoubleReply
		}),
		Rf
	);
}
var hf = {},
	AI;
function xG() {
	if (AI) return hf;
	((AI = 1), Object.defineProperty(hf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(hf.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('TDIGEST.QUANTILE'), r.pushKey(n));
				for (const t of u) r.push(t.toString());
			},
			transformReply: e.transformDoubleArrayReply
		}),
		hf
	);
}
var Rr = {},
	pI;
function mD() {
	if (pI) return Rr;
	((pI = 1), Object.defineProperty(Rr, '__esModule', { value: !0 }), (Rr.transformRankArguments = void 0));
	function e(r, n, u) {
		r.pushKey(n);
		for (const t of u) r.push(t.toString());
	}
	return (
		(Rr.transformRankArguments = e),
		(Rr.default = {
			IS_READ_ONLY: !0,
			parseCommand(...r) {
				(r[0].push('TDIGEST.RANK'), e(...r));
			},
			transformReply: void 0
		}),
		Rr
	);
}
var Sf = {},
	NI;
function ZG() {
	return (
		NI ||
			((NI = 1),
			Object.defineProperty(Sf, '__esModule', { value: !0 }),
			(Sf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r) {
					(e.push('TDIGEST.RESET'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Sf
	);
}
var pe = {},
	CI;
function JG() {
	if (CI) return pe;
	CI = 1;
	var e =
			(pe && pe.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(pe && pe.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(pe && pe.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(pe, '__esModule', { value: !0 });
	const u = n(mD());
	return (
		(pe.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(...t) {
				(t[0].push('TDIGEST.REVRANK'), (0, u.transformRankArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		pe
	);
}
var mf = {},
	II;
function zG() {
	if (II) return mf;
	((II = 1), Object.defineProperty(mf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(mf.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				(r.push('TDIGEST.TRIMMED_MEAN'), r.pushKey(n), r.push(u.toString(), t.toString()));
			},
			transformReply: e.transformDoubleReply
		}),
		mf
	);
}
var LI;
function QG() {
	if (LI) return _r;
	LI = 1;
	var e =
		(_r && _r.__importDefault) ||
		function (S) {
			return S && S.__esModule ? S : { default: S };
		};
	Object.defineProperty(_r, '__esModule', { value: !0 });
	const r = e(HG()),
		n = e(SD()),
		u = e(jG()),
		t = e(FG()),
		i = e(KG()),
		a = e(wG()),
		s = e(XG()),
		o = e(VG()),
		f = e(WG()),
		d = e(xG()),
		_ = e(mD()),
		c = e(ZG()),
		R = e(JG()),
		h = e(zG());
	return (
		(_r.default = {
			ADD: r.default,
			add: r.default,
			BYRANK: n.default,
			byRank: n.default,
			BYREVRANK: u.default,
			byRevRank: u.default,
			CDF: t.default,
			cdf: t.default,
			CREATE: i.default,
			create: i.default,
			INFO: a.default,
			info: a.default,
			MAX: s.default,
			max: s.default,
			MERGE: o.default,
			merge: o.default,
			MIN: f.default,
			min: f.default,
			QUANTILE: d.default,
			quantile: d.default,
			RANK: _.default,
			rank: _.default,
			RESET: c.default,
			reset: c.default,
			REVRANK: R.default,
			revRank: R.default,
			TRIMMED_MEAN: h.default,
			trimmedMean: h.default
		}),
		_r
	);
}
var hr = {},
	Of = {},
	MI;
function kG() {
	return (
		MI ||
			((MI = 1),
			Object.defineProperty(Of, '__esModule', { value: !0 }),
			(Of.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('TOPK.ADD'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Of
	);
}
var Tf = {},
	DI;
function $G() {
	return (
		DI ||
			((DI = 1),
			Object.defineProperty(Tf, '__esModule', { value: !0 }),
			(Tf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('TOPK.COUNT'), e.pushKey(r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		Tf
	);
}
var Af = {},
	yI;
function eY() {
	if (yI) return Af;
	((yI = 1), Object.defineProperty(Af, '__esModule', { value: !0 }));
	function e(r, { item: n, incrementBy: u }) {
		r.push(n, u.toString());
	}
	return (
		(Af.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				if ((r.push('TOPK.INCRBY'), r.pushKey(n), Array.isArray(u))) for (const t of u) e(r, t);
				else e(r, u);
			},
			transformReply: void 0
		}),
		Af
	);
}
var pf = {},
	PI;
function tY() {
	if (PI) return pf;
	((PI = 1), Object.defineProperty(pf, '__esModule', { value: !0 }));
	const e = L(),
		r = kr();
	return (
		(pf.default = {
			IS_READ_ONLY: !0,
			parseCommand(n, u) {
				(n.push('TOPK.INFO'), n.pushKey(u));
			},
			transformReply: { 2: (n, u, t) => ((n[7] = e.transformDoubleReply[2](n[7], u, t)), (0, r.transformInfoV2Reply)(n, t)), 3: void 0 }
		}),
		pf
	);
}
var Nf = {},
	vI;
function rY() {
	return (
		vI ||
			((vI = 1),
			Object.defineProperty(Nf, '__esModule', { value: !0 }),
			(Nf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('TOPK.LIST'), e.pushKey(r), e.push('WITHCOUNT'));
				},
				transformReply(e) {
					const r = [];
					for (let n = 0; n < e.length; n++) r.push({ item: e[n], count: e[++n] });
					return r;
				}
			})),
		Nf
	);
}
var Cf = {},
	bI;
function nY() {
	return (
		bI ||
			((bI = 1),
			Object.defineProperty(Cf, '__esModule', { value: !0 }),
			(Cf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('TOPK.LIST'), e.pushKey(r));
				},
				transformReply: void 0
			})),
		Cf
	);
}
var If = {},
	gI;
function uY() {
	if (gI) return If;
	((gI = 1), Object.defineProperty(If, '__esModule', { value: !0 }));
	const e = L();
	return (
		(If.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('TOPK.QUERY'), r.pushKey(n), r.pushVariadic(u));
			},
			transformReply: e.transformBooleanArrayReply
		}),
		If
	);
}
var Lf = {},
	UI;
function iY() {
	return (
		UI ||
			((UI = 1),
			Object.defineProperty(Lf, '__esModule', { value: !0 }),
			(Lf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('TOPK.RESERVE'), e.pushKey(r), e.push(n.toString()), u && e.push(u.width.toString(), u.depth.toString(), u.decay.toString()));
				},
				transformReply: void 0
			})),
		Lf
	);
}
var GI;
function sY() {
	if (GI) return hr;
	GI = 1;
	var e =
		(hr && hr.__importDefault) ||
		function (f) {
			return f && f.__esModule ? f : { default: f };
		};
	Object.defineProperty(hr, '__esModule', { value: !0 });
	const r = e(kG()),
		n = e($G()),
		u = e(eY()),
		t = e(tY()),
		i = e(rY()),
		a = e(nY()),
		s = e(uY()),
		o = e(iY());
	return (
		(hr.default = {
			ADD: r.default,
			add: r.default,
			COUNT: n.default,
			count: n.default,
			INCRBY: u.default,
			incrBy: u.default,
			INFO: t.default,
			info: t.default,
			LIST_WITHCOUNT: i.default,
			listWithCount: i.default,
			LIST: a.default,
			list: a.default,
			QUERY: s.default,
			query: s.default,
			RESERVE: o.default,
			reserve: o.default
		}),
		hr
	);
}
var YI;
function aY() {
	if (YI) return fr;
	YI = 1;
	var e =
		(fr && fr.__importDefault) ||
		function (a) {
			return a && a.__esModule ? a : { default: a };
		};
	Object.defineProperty(fr, '__esModule', { value: !0 });
	const r = e(kr()),
		n = e(MG()),
		u = e(qG()),
		t = e(QG()),
		i = e(sY());
	return ((fr.default = { bf: r.default, cms: n.default, cf: u.default, tDigest: t.default, topK: i.default }), fr);
}
var BI;
function qI() {
	return (
		BI ||
			((BI = 1),
			(function (e) {
				var r =
					(wr && wr.__importDefault) ||
					function (u) {
						return u && u.__esModule ? u : { default: u };
					};
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.default = void 0));
				var n = aY();
				Object.defineProperty(e, 'default', {
					enumerable: !0,
					get: function () {
						return r(n).default;
					}
				});
			})(wr)),
		wr
	);
}
var Vr = {},
	Wr = {},
	Mf = {},
	HI;
function oY() {
	if (HI) return Mf;
	((HI = 1), Object.defineProperty(Mf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Mf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, ...i) {
				(r.push('JSON.ARRAPPEND'), r.pushKey(n), r.push(u, (0, e.transformRedisJsonArgument)(t)));
				for (let a = 0; a < i.length; a++) r.push((0, e.transformRedisJsonArgument)(i[a]));
			},
			transformReply: void 0
		}),
		Mf
	);
}
var Df = {},
	jI;
function fY() {
	if (jI) return Df;
	((jI = 1), Object.defineProperty(Df, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Df.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t, i) {
				(r.push('JSON.ARRINDEX'),
					r.pushKey(n),
					r.push(u, (0, e.transformRedisJsonArgument)(t)),
					i?.range && (r.push(i.range.start.toString()), i.range.stop !== void 0 && r.push(i.range.stop.toString())));
			},
			transformReply: void 0
		}),
		Df
	);
}
var yf = {},
	FI;
function dY() {
	if (FI) return yf;
	((FI = 1), Object.defineProperty(yf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(yf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i, ...a) {
				(r.push('JSON.ARRINSERT'), r.pushKey(n), r.push(u, t.toString(), (0, e.transformRedisJsonArgument)(i)));
				for (let s = 0; s < a.length; s++) r.push((0, e.transformRedisJsonArgument)(a[s]));
			},
			transformReply: void 0
		}),
		yf
	);
}
var Pf = {},
	KI;
function lY() {
	return (
		KI ||
			((KI = 1),
			Object.defineProperty(Pf, '__esModule', { value: !0 }),
			(Pf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('JSON.ARRLEN'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		Pf
	);
}
var vf = {},
	wI;
function cY() {
	if (wI) return vf;
	((wI = 1), Object.defineProperty(vf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(vf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('JSON.ARRPOP'), r.pushKey(n), u && (r.push(u.path), u.index !== void 0 && r.push(u.index.toString())));
			},
			transformReply(r) {
				return (0, e.isArrayReply)(r) ? r.map((n) => (0, e.transformRedisJsonNullReply)(n)) : (0, e.transformRedisJsonNullReply)(r);
			}
		}),
		vf
	);
}
var bf = {},
	XI;
function _Y() {
	return (
		XI ||
			((XI = 1),
			Object.defineProperty(bf, '__esModule', { value: !0 }),
			(bf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t) {
					(e.push('JSON.ARRTRIM'), e.pushKey(r), e.push(n, u.toString(), t.toString()));
				},
				transformReply: void 0
			})),
		bf
	);
}
var gf = {},
	VI;
function EY() {
	return (
		VI ||
			((VI = 1),
			Object.defineProperty(gf, '__esModule', { value: !0 }),
			(gf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('JSON.CLEAR'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		gf
	);
}
var Uf = {},
	WI;
function RY() {
	return (
		WI ||
			((WI = 1),
			Object.defineProperty(Uf, '__esModule', { value: !0 }),
			(Uf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('JSON.DEBUG', 'MEMORY'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		Uf
	);
}
var Gf = {},
	xI;
function hY() {
	return (
		xI ||
			((xI = 1),
			Object.defineProperty(Gf, '__esModule', { value: !0 }),
			(Gf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('JSON.DEL'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		Gf
	);
}
var Yf = {},
	ZI;
function SY() {
	return (
		ZI ||
			((ZI = 1),
			Object.defineProperty(Yf, '__esModule', { value: !0 }),
			(Yf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('JSON.FORGET'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		Yf
	);
}
var Bf = {},
	JI;
function mY() {
	if (JI) return Bf;
	((JI = 1), Object.defineProperty(Bf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Bf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('JSON.GET'), r.pushKey(n), u?.path !== void 0 && r.pushVariadic(u.path));
			},
			transformReply: e.transformRedisJsonNullReply
		}),
		Bf
	);
}
var qf = {},
	zI;
function OY() {
	if (zI) return qf;
	((zI = 1), Object.defineProperty(qf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(qf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('JSON.MERGE'), r.pushKey(n), r.push(u, (0, e.transformRedisJsonArgument)(t)));
			},
			transformReply: void 0
		}),
		qf
	);
}
var Hf = {},
	QI;
function TY() {
	if (QI) return Hf;
	((QI = 1), Object.defineProperty(Hf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Hf.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('JSON.MGET'), r.pushKeys(n), r.push(u));
			},
			transformReply(r) {
				return r.map((n) => (0, e.transformRedisJsonNullReply)(n));
			}
		}),
		Hf
	);
}
var jf = {},
	kI;
function AY() {
	if (kI) return jf;
	((kI = 1), Object.defineProperty(jf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(jf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n) {
				r.push('JSON.MSET');
				for (let u = 0; u < n.length; u++) (r.pushKey(n[u].key), r.push(n[u].path, (0, e.transformRedisJsonArgument)(n[u].value)));
			},
			transformReply: void 0
		}),
		jf
	);
}
var Ff = {},
	$I;
function OD() {
	return (
		$I ||
			(($I = 1),
			Object.defineProperty(Ff, '__esModule', { value: !0 }),
			(Ff.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u) {
					(e.push('JSON.NUMINCRBY'), e.pushKey(r), e.push(n, u.toString()));
				},
				transformReply: { 2: (e) => JSON.parse(e.toString()), 3: void 0 }
			})),
		Ff
	);
}
var Sr = {},
	eL;
function pY() {
	if (eL) return Sr;
	eL = 1;
	var e =
		(Sr && Sr.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Sr, '__esModule', { value: !0 });
	const r = e(OD());
	return (
		(Sr.default = {
			IS_READ_ONLY: !1,
			parseCommand(n, u, t, i) {
				(n.push('JSON.NUMMULTBY'), n.pushKey(u), n.push(t, i.toString()));
			},
			transformReply: r.default.transformReply
		}),
		Sr
	);
}
var Kf = {},
	tL;
function NY() {
	return (
		tL ||
			((tL = 1),
			Object.defineProperty(Kf, '__esModule', { value: !0 }),
			(Kf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('JSON.OBJKEYS'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		Kf
	);
}
var wf = {},
	rL;
function CY() {
	return (
		rL ||
			((rL = 1),
			Object.defineProperty(wf, '__esModule', { value: !0 }),
			(wf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('JSON.OBJLEN'), e.pushKey(r), n?.path !== void 0 && e.push(n.path));
				},
				transformReply: void 0
			})),
		wf
	);
}
var Xf = {},
	nL;
function IY() {
	if (nL) return Xf;
	((nL = 1), Object.defineProperty(Xf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Xf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i) {
				(r.push('JSON.SET'),
					r.pushKey(n),
					r.push(u, (0, e.transformRedisJsonArgument)(t)),
					i?.condition ? r.push(i?.condition) : i?.NX ? r.push('NX') : i?.XX && r.push('XX'));
			},
			transformReply: void 0
		}),
		Xf
	);
}
var Vf = {},
	uL;
function LY() {
	if (uL) return Vf;
	((uL = 1), Object.defineProperty(Vf, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Vf.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('JSON.STRAPPEND'), r.pushKey(n), t?.path !== void 0 && r.push(t.path), r.push((0, e.transformRedisJsonArgument)(u)));
			},
			transformReply: void 0
		}),
		Vf
	);
}
var Wf = {},
	iL;
function MY() {
	return (
		iL ||
			((iL = 1),
			Object.defineProperty(Wf, '__esModule', { value: !0 }),
			(Wf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('JSON.STRLEN'), e.pushKey(r), n?.path && e.push(n.path));
				},
				transformReply: void 0
			})),
		Wf
	);
}
var xf = {},
	sL;
function DY() {
	return (
		sL ||
			((sL = 1),
			Object.defineProperty(xf, '__esModule', { value: !0 }),
			(xf.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('JSON.TOGGLE'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		xf
	);
}
var Zf = {},
	aL;
function yY() {
	return (
		aL ||
			((aL = 1),
			Object.defineProperty(Zf, '__esModule', { value: !0 }),
			(Zf.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('JSON.TYPE'), e.pushKey(r), n?.path && e.push(n.path));
				},
				transformReply: { 2: void 0, 3: (e) => e[0] }
			})),
		Zf
	);
}
var oL;
function PY() {
	return (
		oL ||
			((oL = 1),
			(function (e) {
				var r =
					(Wr && Wr.__importDefault) ||
					function (C) {
						return C && C.__esModule ? C : { default: C };
					};
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.transformRedisJsonNullReply = e.transformRedisJsonReply = e.transformRedisJsonArgument = void 0));
				const n = r(oY()),
					u = r(fY()),
					t = r(dY()),
					i = r(lY()),
					a = r(cY()),
					s = r(_Y()),
					o = r(EY()),
					f = r(RY()),
					d = r(hY()),
					_ = r(SY()),
					c = r(mY()),
					R = r(OY()),
					h = r(TY()),
					S = r(AY()),
					O = r(OD()),
					l = r(pY()),
					E = r(NY()),
					T = r(CY()),
					I = r(IY()),
					P = r(LY()),
					D = r(MY()),
					m = r(DY()),
					A = r(yY());
				var N = L();
				(Object.defineProperty(e, 'transformRedisJsonArgument', {
					enumerable: !0,
					get: function () {
						return N.transformRedisJsonArgument;
					}
				}),
					Object.defineProperty(e, 'transformRedisJsonReply', {
						enumerable: !0,
						get: function () {
							return N.transformRedisJsonReply;
						}
					}),
					Object.defineProperty(e, 'transformRedisJsonNullReply', {
						enumerable: !0,
						get: function () {
							return N.transformRedisJsonNullReply;
						}
					}),
					(e.default = {
						ARRAPPEND: n.default,
						arrAppend: n.default,
						ARRINDEX: u.default,
						arrIndex: u.default,
						ARRINSERT: t.default,
						arrInsert: t.default,
						ARRLEN: i.default,
						arrLen: i.default,
						ARRPOP: a.default,
						arrPop: a.default,
						ARRTRIM: s.default,
						arrTrim: s.default,
						CLEAR: o.default,
						clear: o.default,
						DEBUG_MEMORY: f.default,
						debugMemory: f.default,
						DEL: d.default,
						del: d.default,
						FORGET: _.default,
						forget: _.default,
						GET: c.default,
						get: c.default,
						MERGE: R.default,
						merge: R.default,
						MGET: h.default,
						mGet: h.default,
						MSET: S.default,
						mSet: S.default,
						NUMINCRBY: O.default,
						numIncrBy: O.default,
						NUMMULTBY: l.default,
						numMultBy: l.default,
						OBJKEYS: E.default,
						objKeys: E.default,
						OBJLEN: T.default,
						objLen: T.default,
						SET: I.default,
						set: I.default,
						STRAPPEND: P.default,
						strAppend: P.default,
						STRLEN: D.default,
						strLen: D.default,
						TOGGLE: m.default,
						toggle: m.default,
						TYPE: A.default,
						type: A.default
					}));
			})(Wr)),
		Wr
	);
}
var fL;
function dL() {
	return (
		fL ||
			((fL = 1),
			(function (e) {
				var r =
					(Vr && Vr.__importDefault) ||
					function (u) {
						return u && u.__esModule ? u : { default: u };
					};
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.default = void 0));
				var n = PY();
				Object.defineProperty(e, 'default', {
					enumerable: !0,
					get: function () {
						return r(n).default;
					}
				});
			})(Vr)),
		Vr
	);
}
var xr = {},
	mr = {},
	Jf = {},
	lL;
function vY() {
	return (
		lL ||
			((lL = 1),
			Object.defineProperty(Jf, '__esModule', { value: !0 }),
			(Jf.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e) {
					e.push('FT._LIST');
				},
				transformReply: { 2: void 0, 3: void 0 }
			})),
		Jf
	);
}
var zf = {},
	zd = {},
	cL;
function ol() {
	return (
		cL ||
			((cL = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.REDISEARCH_LANGUAGE =
						e.parseSchema =
						e.SCHEMA_GEO_SHAPE_COORD_SYSTEM =
						e.VAMANA_COMPRESSION_ALGORITHM =
						e.SCHEMA_VECTOR_FIELD_ALGORITHM =
						e.SCHEMA_TEXT_FIELD_PHONETIC =
						e.SCHEMA_FIELD_TYPE =
							void 0));
				const r = L();
				((e.SCHEMA_FIELD_TYPE = { TEXT: 'TEXT', NUMERIC: 'NUMERIC', GEO: 'GEO', TAG: 'TAG', VECTOR: 'VECTOR', GEOSHAPE: 'GEOSHAPE' }),
					(e.SCHEMA_TEXT_FIELD_PHONETIC = { DM_EN: 'dm:en', DM_FR: 'dm:fr', FM_PT: 'dm:pt', DM_ES: 'dm:es' }),
					(e.SCHEMA_VECTOR_FIELD_ALGORITHM = { FLAT: 'FLAT', HNSW: 'HNSW', VAMANA: 'SVS-VAMANA' }),
					(e.VAMANA_COMPRESSION_ALGORITHM = {
						LVQ4: 'LVQ4',
						LVQ8: 'LVQ8',
						LVQ4x4: 'LVQ4x4',
						LVQ4x8: 'LVQ4x8',
						LeanVec4x8: 'LeanVec4x8',
						LeanVec8x8: 'LeanVec8x8'
					}),
					(e.SCHEMA_GEO_SHAPE_COORD_SYSTEM = { SPHERICAL: 'SPHERICAL', FLAT: 'FLAT' }));
				function n(t, i) {
					(i.SORTABLE && (t.push('SORTABLE'), i.SORTABLE === 'UNF' && t.push('UNF')), i.NOINDEX && t.push('NOINDEX'));
				}
				function u(t, i) {
					for (const [a, s] of Object.entries(i)) {
						if ((t.push(a), typeof s == 'string')) {
							t.push(s);
							continue;
						}
						switch ((s.AS && t.push('AS', s.AS), t.push(s.type), s.INDEXMISSING && t.push('INDEXMISSING'), s.type)) {
							case e.SCHEMA_FIELD_TYPE.TEXT:
								(s.NOSTEM && t.push('NOSTEM'),
									s.WEIGHT !== void 0 && t.push('WEIGHT', s.WEIGHT.toString()),
									s.PHONETIC && t.push('PHONETIC', s.PHONETIC),
									s.WITHSUFFIXTRIE && t.push('WITHSUFFIXTRIE'),
									s.INDEXEMPTY && t.push('INDEXEMPTY'),
									n(t, s));
								break;
							case e.SCHEMA_FIELD_TYPE.NUMERIC:
							case e.SCHEMA_FIELD_TYPE.GEO:
								n(t, s);
								break;
							case e.SCHEMA_FIELD_TYPE.TAG:
								(s.SEPARATOR && t.push('SEPARATOR', s.SEPARATOR),
									s.CASESENSITIVE && t.push('CASESENSITIVE'),
									s.WITHSUFFIXTRIE && t.push('WITHSUFFIXTRIE'),
									s.INDEXEMPTY && t.push('INDEXEMPTY'),
									n(t, s));
								break;
							case e.SCHEMA_FIELD_TYPE.VECTOR:
								t.push(s.ALGORITHM);
								const o = [];
								switch (
									(o.push('TYPE', s.TYPE, 'DIM', s.DIM.toString(), 'DISTANCE_METRIC', s.DISTANCE_METRIC),
									s.INITIAL_CAP !== void 0 && o.push('INITIAL_CAP', s.INITIAL_CAP.toString()),
									s.ALGORITHM)
								) {
									case e.SCHEMA_VECTOR_FIELD_ALGORITHM.FLAT:
										s.BLOCK_SIZE !== void 0 && o.push('BLOCK_SIZE', s.BLOCK_SIZE.toString());
										break;
									case e.SCHEMA_VECTOR_FIELD_ALGORITHM.HNSW:
										(s.M !== void 0 && o.push('M', s.M.toString()),
											s.EF_CONSTRUCTION !== void 0 && o.push('EF_CONSTRUCTION', s.EF_CONSTRUCTION.toString()),
											s.EF_RUNTIME !== void 0 && o.push('EF_RUNTIME', s.EF_RUNTIME.toString()));
										break;
									case e.SCHEMA_VECTOR_FIELD_ALGORITHM.VAMANA:
										(s.COMPRESSION && o.push('COMPRESSION', s.COMPRESSION),
											s.CONSTRUCTION_WINDOW_SIZE !== void 0 && o.push('CONSTRUCTION_WINDOW_SIZE', s.CONSTRUCTION_WINDOW_SIZE.toString()),
											s.GRAPH_MAX_DEGREE !== void 0 && o.push('GRAPH_MAX_DEGREE', s.GRAPH_MAX_DEGREE.toString()),
											s.SEARCH_WINDOW_SIZE !== void 0 && o.push('SEARCH_WINDOW_SIZE', s.SEARCH_WINDOW_SIZE.toString()),
											s.EPSILON !== void 0 && o.push('EPSILON', s.EPSILON.toString()),
											s.TRAINING_THRESHOLD !== void 0 && o.push('TRAINING_THRESHOLD', s.TRAINING_THRESHOLD.toString()),
											s.REDUCE !== void 0 && o.push('REDUCE', s.REDUCE.toString()));
										break;
								}
								t.pushVariadicWithLength(o);
								break;
							case e.SCHEMA_FIELD_TYPE.GEOSHAPE:
								s.COORD_SYSTEM !== void 0 && t.push('COORD_SYSTEM', s.COORD_SYSTEM);
								break;
						}
					}
				}
				((e.parseSchema = u),
					(e.REDISEARCH_LANGUAGE = {
						ARABIC: 'Arabic',
						BASQUE: 'Basque',
						CATALANA: 'Catalan',
						DANISH: 'Danish',
						DUTCH: 'Dutch',
						ENGLISH: 'English',
						FINNISH: 'Finnish',
						FRENCH: 'French',
						GERMAN: 'German',
						GREEK: 'Greek',
						HUNGARIAN: 'Hungarian',
						INDONESAIN: 'Indonesian',
						IRISH: 'Irish',
						ITALIAN: 'Italian',
						LITHUANIAN: 'Lithuanian',
						NEPALI: 'Nepali',
						NORWEIGAN: 'Norwegian',
						PORTUGUESE: 'Portuguese',
						ROMANIAN: 'Romanian',
						RUSSIAN: 'Russian',
						SPANISH: 'Spanish',
						SWEDISH: 'Swedish',
						TAMIL: 'Tamil',
						TURKISH: 'Turkish',
						CHINESE: 'Chinese'
					}),
					(e.default = {
						NOT_KEYED_COMMAND: !0,
						IS_READ_ONLY: !0,
						parseCommand(t, i, a, s) {
							(t.push('FT.CREATE', i),
								s?.ON && t.push('ON', s.ON),
								(0, r.parseOptionalVariadicArgument)(t, 'PREFIX', s?.PREFIX),
								s?.FILTER && t.push('FILTER', s.FILTER),
								s?.LANGUAGE && t.push('LANGUAGE', s.LANGUAGE),
								s?.LANGUAGE_FIELD && t.push('LANGUAGE_FIELD', s.LANGUAGE_FIELD),
								s?.SCORE && t.push('SCORE', s.SCORE.toString()),
								s?.SCORE_FIELD && t.push('SCORE_FIELD', s.SCORE_FIELD),
								s?.MAXTEXTFIELDS && t.push('MAXTEXTFIELDS'),
								s?.TEMPORARY && t.push('TEMPORARY', s.TEMPORARY.toString()),
								s?.NOOFFSETS && t.push('NOOFFSETS'),
								s?.NOHL && t.push('NOHL'),
								s?.NOFIELDS && t.push('NOFIELDS'),
								s?.NOFREQS && t.push('NOFREQS'),
								s?.SKIPINITIALSCAN && t.push('SKIPINITIALSCAN'),
								(0, r.parseOptionalVariadicArgument)(t, 'STOPWORDS', s?.STOPWORDS),
								t.push('SCHEMA'),
								u(t, a));
						},
						transformReply: void 0
					}));
			})(zd)),
		zd
	);
}
var _L;
function bY() {
	if (_L) return zf;
	((_L = 1), Object.defineProperty(zf, '__esModule', { value: !0 }));
	const e = ol();
	return (
		(zf.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u) {
				(r.push('FT.ALTER', n, 'SCHEMA', 'ADD'), (0, e.parseSchema)(r, u));
			},
			transformReply: void 0
		}),
		zf
	);
}
var Or = {},
	Qd = {},
	xe = {},
	Zr = {},
	EL;
function $r() {
	return (EL || ((EL = 1), Object.defineProperty(Zr, '__esModule', { value: !0 }), (Zr.DEFAULT_DIALECT = void 0), (Zr.DEFAULT_DIALECT = '2')), Zr);
}
var RL;
function Yr() {
	if (RL) return xe;
	((RL = 1), Object.defineProperty(xe, '__esModule', { value: !0 }), (xe.parseSearchOptions = xe.parseParamsArgument = void 0));
	const e = L(),
		r = $r();
	function n(i, a) {
		if (a) {
			i.push('PARAMS');
			const s = [];
			for (const o in a) {
				if (!Object.hasOwn(a, o)) continue;
				const f = a[o];
				s.push(o, typeof f == 'number' ? f.toString() : f);
			}
			i.pushVariadicWithLength(s);
		}
	}
	xe.parseParamsArgument = n;
	function u(i, a) {
		(a?.VERBATIM && i.push('VERBATIM'),
			a?.NOSTOPWORDS && i.push('NOSTOPWORDS'),
			(0, e.parseOptionalVariadicArgument)(i, 'INKEYS', a?.INKEYS),
			(0, e.parseOptionalVariadicArgument)(i, 'INFIELDS', a?.INFIELDS),
			(0, e.parseOptionalVariadicArgument)(i, 'RETURN', a?.RETURN),
			a?.SUMMARIZE &&
				(i.push('SUMMARIZE'),
				typeof a.SUMMARIZE == 'object' &&
					((0, e.parseOptionalVariadicArgument)(i, 'FIELDS', a.SUMMARIZE.FIELDS),
					a.SUMMARIZE.FRAGS !== void 0 && i.push('FRAGS', a.SUMMARIZE.FRAGS.toString()),
					a.SUMMARIZE.LEN !== void 0 && i.push('LEN', a.SUMMARIZE.LEN.toString()),
					a.SUMMARIZE.SEPARATOR !== void 0 && i.push('SEPARATOR', a.SUMMARIZE.SEPARATOR))),
			a?.HIGHLIGHT &&
				(i.push('HIGHLIGHT'),
				typeof a.HIGHLIGHT == 'object' &&
					((0, e.parseOptionalVariadicArgument)(i, 'FIELDS', a.HIGHLIGHT.FIELDS),
					a.HIGHLIGHT.TAGS && i.push('TAGS', a.HIGHLIGHT.TAGS.open, a.HIGHLIGHT.TAGS.close))),
			a?.SLOP !== void 0 && i.push('SLOP', a.SLOP.toString()),
			a?.TIMEOUT !== void 0 && i.push('TIMEOUT', a.TIMEOUT.toString()),
			a?.INORDER && i.push('INORDER'),
			a?.LANGUAGE && i.push('LANGUAGE', a.LANGUAGE),
			a?.EXPANDER && i.push('EXPANDER', a.EXPANDER),
			a?.SCORER && i.push('SCORER', a.SCORER),
			a?.SORTBY &&
				(i.push('SORTBY'),
				typeof a.SORTBY == 'string' || a.SORTBY instanceof Buffer
					? i.push(a.SORTBY)
					: (i.push(a.SORTBY.BY), a.SORTBY.DIRECTION && i.push(a.SORTBY.DIRECTION))),
			a?.LIMIT && i.push('LIMIT', a.LIMIT.from.toString(), a.LIMIT.size.toString()),
			n(i, a?.PARAMS),
			a?.DIALECT ? i.push('DIALECT', a.DIALECT.toString()) : i.push('DIALECT', r.DEFAULT_DIALECT));
	}
	((xe.parseSearchOptions = u),
		(xe.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(i, a, s, o) {
				(i.push('FT.SEARCH', a, s), u(i, o));
			},
			transformReply: {
				2: (i) => {
					const a = i.length > 2 && !Array.isArray(i[2]),
						s = [];
					let o = 1;
					for (; o < i.length; ) s.push({ id: i[o++], value: a ? Object.create(null) : t(i[o++]) });
					return { total: i[0], documents: s };
				},
				3: void 0
			},
			unstableResp3: !0
		}));
	function t(i) {
		const a = Object.create(null);
		if (!i) return a;
		let s = 0;
		for (; s < i.length; ) {
			const o = i[s++],
				f = i[s++];
			if (o === '$')
				try {
					Object.assign(a, JSON.parse(f));
					continue;
				} catch {}
			a[o] = f;
		}
		return a;
	}
	return xe;
}
var hL;
function Yd() {
	return (
		hL ||
			((hL = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.parseAggregateOptions = e.FT_AGGREGATE_GROUP_BY_REDUCERS = e.FT_AGGREGATE_STEPS = void 0));
				const r = Yr(),
					n = L(),
					u = $r();
				((e.FT_AGGREGATE_STEPS = { GROUPBY: 'GROUPBY', SORTBY: 'SORTBY', APPLY: 'APPLY', LIMIT: 'LIMIT', FILTER: 'FILTER' }),
					(e.FT_AGGREGATE_GROUP_BY_REDUCERS = {
						COUNT: 'COUNT',
						COUNT_DISTINCT: 'COUNT_DISTINCT',
						COUNT_DISTINCTISH: 'COUNT_DISTINCTISH',
						SUM: 'SUM',
						MIN: 'MIN',
						MAX: 'MAX',
						AVG: 'AVG',
						STDDEV: 'STDDEV',
						QUANTILE: 'QUANTILE',
						TOLIST: 'TOLIST',
						FIRST_VALUE: 'FIRST_VALUE',
						RANDOM_SAMPLE: 'RANDOM_SAMPLE'
					}),
					(e.default = {
						NOT_KEYED_COMMAND: !0,
						IS_READ_ONLY: !1,
						parseCommand(o, f, d, _) {
							return (o.push('FT.AGGREGATE', f, d), t(o, _));
						},
						transformReply: {
							2: (o, f, d) => {
								const _ = [];
								for (let c = 1; c < o.length; c++) _.push((0, n.transformTuplesReply)(o[c], f, d));
								return { total: Number(o[0]), results: _ };
							},
							3: void 0
						},
						unstableResp3: !0
					}));
				function t(o, f) {
					if ((f?.VERBATIM && o.push('VERBATIM'), f?.ADDSCORES && o.push('ADDSCORES'), f?.LOAD)) {
						const d = [];
						if (Array.isArray(f.LOAD)) for (const _ of f.LOAD) i(d, _);
						else i(d, f.LOAD);
						(o.push('LOAD'), o.pushVariadicWithLength(d));
					}
					if ((f?.TIMEOUT !== void 0 && o.push('TIMEOUT', f.TIMEOUT.toString()), f?.STEPS))
						for (const d of f.STEPS)
							switch ((o.push(d.type), d.type)) {
								case e.FT_AGGREGATE_STEPS.GROUPBY:
									if ((d.properties ? o.pushVariadicWithLength(d.properties) : o.push('0'), Array.isArray(d.REDUCE)))
										for (const c of d.REDUCE) a(o, c);
									else a(o, d.REDUCE);
									break;
								case e.FT_AGGREGATE_STEPS.SORTBY:
									const _ = [];
									if (Array.isArray(d.BY)) for (const c of d.BY) s(_, c);
									else s(_, d.BY);
									(d.MAX && _.push('MAX', d.MAX.toString()), o.pushVariadicWithLength(_));
									break;
								case e.FT_AGGREGATE_STEPS.APPLY:
									o.push(d.expression, 'AS', d.AS);
									break;
								case e.FT_AGGREGATE_STEPS.LIMIT:
									o.push(d.from.toString(), d.size.toString());
									break;
								case e.FT_AGGREGATE_STEPS.FILTER:
									o.push(d.expression);
									break;
							}
					((0, r.parseParamsArgument)(o, f?.PARAMS), f?.DIALECT ? o.push('DIALECT', f.DIALECT.toString()) : o.push('DIALECT', u.DEFAULT_DIALECT));
				}
				e.parseAggregateOptions = t;
				function i(o, f) {
					typeof f == 'string' || f instanceof Buffer ? o.push(f) : (o.push(f.identifier), f.AS && o.push('AS', f.AS));
				}
				function a(o, f) {
					switch ((o.push('REDUCE', f.type), f.type)) {
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.COUNT:
							o.push('0');
							break;
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.COUNT_DISTINCT:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.COUNT_DISTINCTISH:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.SUM:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.MIN:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.MAX:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.AVG:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.STDDEV:
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.TOLIST:
							o.push('1', f.property);
							break;
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.QUANTILE:
							o.push('2', f.property, f.quantile.toString());
							break;
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.FIRST_VALUE: {
							const d = [f.property];
							(f.BY &&
								(d.push('BY'),
								typeof f.BY == 'string' || f.BY instanceof Buffer ? d.push(f.BY) : (d.push(f.BY.property), f.BY.direction && d.push(f.BY.direction))),
								o.pushVariadicWithLength(d));
							break;
						}
						case e.FT_AGGREGATE_GROUP_BY_REDUCERS.RANDOM_SAMPLE:
							o.push('2', f.property, f.sampleSize.toString());
							break;
					}
					f.AS && o.push('AS', f.AS);
				}
				function s(o, f) {
					typeof f == 'string' || f instanceof Buffer ? o.push(f) : (o.push(f.BY), f.DIRECTION && o.push(f.DIRECTION));
				}
			})(Qd)),
		Qd
	);
}
var SL;
function TD() {
	if (SL) return Or;
	SL = 1;
	var e =
		(Or && Or.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Or, '__esModule', { value: !0 });
	const r = e(Yd());
	return (
		(Or.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u, t, i) {
				(r.default.parseCommand(n, u, t, i),
					n.push('WITHCURSOR'),
					i?.COUNT !== void 0 && n.push('COUNT', i.COUNT.toString()),
					i?.MAXIDLE !== void 0 && n.push('MAXIDLE', i.MAXIDLE.toString()));
			},
			transformReply: { 2: (n) => ({ ...r.default.transformReply[2](n[0]), cursor: n[1] }), 3: void 0 },
			unstableResp3: !0
		}),
		Or
	);
}
var Qf = {},
	mL;
function gY() {
	return (
		mL ||
			((mL = 1),
			Object.defineProperty(Qf, '__esModule', { value: !0 }),
			(Qf.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('FT.ALIASADD', r, n);
				},
				transformReply: void 0
			})),
		Qf
	);
}
var kf = {},
	OL;
function UY() {
	return (
		OL ||
			((OL = 1),
			Object.defineProperty(kf, '__esModule', { value: !0 }),
			(kf.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('FT.ALIASDEL', r);
				},
				transformReply: void 0
			})),
		kf
	);
}
var $f = {},
	TL;
function GY() {
	return (
		TL ||
			((TL = 1),
			Object.defineProperty($f, '__esModule', { value: !0 }),
			($f.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('FT.ALIASUPDATE', r, n);
				},
				transformReply: void 0
			})),
		$f
	);
}
var ed = {},
	AL;
function YY() {
	return (
		AL ||
			((AL = 1),
			Object.defineProperty(ed, '__esModule', { value: !0 }),
			(ed.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('FT.CONFIG', 'GET', r);
				},
				transformReply(e) {
					const r = Object.create(null);
					for (const n of e) {
						const [u, t] = n;
						r[u.toString()] = t;
					}
					return r;
				}
			})),
		ed
	);
}
var td = {},
	pL;
function BY() {
	return (
		pL ||
			((pL = 1),
			Object.defineProperty(td, '__esModule', { value: !0 }),
			(td.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('FT.CONFIG', 'SET', r, n);
				},
				transformReply: void 0
			})),
		td
	);
}
var rd = {},
	NL;
function qY() {
	return (
		NL ||
			((NL = 1),
			Object.defineProperty(rd, '__esModule', { value: !0 }),
			(rd.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('FT.CURSOR', 'DEL', r, n.toString());
				},
				transformReply: void 0
			})),
		rd
	);
}
var Tr = {},
	CL;
function HY() {
	if (CL) return Tr;
	CL = 1;
	var e =
		(Tr && Tr.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Tr, '__esModule', { value: !0 });
	const r = e(TD());
	return (
		(Tr.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(n, u, t, i) {
				(n.push('FT.CURSOR', 'READ', u, t.toString()), i?.COUNT !== void 0 && n.push('COUNT', i.COUNT.toString()));
			},
			transformReply: r.default.transformReply,
			unstableResp3: !0
		}),
		Tr
	);
}
var nd = {},
	IL;
function jY() {
	return (
		IL ||
			((IL = 1),
			Object.defineProperty(nd, '__esModule', { value: !0 }),
			(nd.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('FT.DICTADD', r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		nd
	);
}
var ud = {},
	LL;
function FY() {
	return (
		LL ||
			((LL = 1),
			Object.defineProperty(ud, '__esModule', { value: !0 }),
			(ud.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('FT.DICTDEL', r), e.pushVariadic(n));
				},
				transformReply: void 0
			})),
		ud
	);
}
var id = {},
	ML;
function KY() {
	return (
		ML ||
			((ML = 1),
			Object.defineProperty(id, '__esModule', { value: !0 }),
			(id.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('FT.DICTDUMP', r);
				},
				transformReply: { 2: void 0, 3: void 0 }
			})),
		id
	);
}
var sd = {},
	DL;
function wY() {
	return (
		DL ||
			((DL = 1),
			Object.defineProperty(sd, '__esModule', { value: !0 }),
			(sd.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('FT.DROPINDEX', r), n?.DD && e.push('DD'));
				},
				transformReply: { 2: void 0, 3: void 0 }
			})),
		sd
	);
}
var ad = {},
	yL;
function XY() {
	if (yL) return ad;
	((yL = 1), Object.defineProperty(ad, '__esModule', { value: !0 }));
	const e = Yr(),
		r = $r();
	return (
		(ad.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(n, u, t, i) {
				(n.push('FT.EXPLAIN', u, t),
					(0, e.parseParamsArgument)(n, i?.PARAMS),
					i?.DIALECT ? n.push('DIALECT', i.DIALECT.toString()) : n.push('DIALECT', r.DEFAULT_DIALECT));
			},
			transformReply: void 0
		}),
		ad
	);
}
var od = {},
	PL;
function VY() {
	if (PL) return od;
	((PL = 1), Object.defineProperty(od, '__esModule', { value: !0 }));
	const e = $r();
	return (
		(od.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(r, n, u, t) {
				(r.push('FT.EXPLAINCLI', n, u), t?.DIALECT ? r.push('DIALECT', t.DIALECT.toString()) : r.push('DIALECT', e.DEFAULT_DIALECT));
			},
			transformReply: void 0
		}),
		od
	);
}
var fd = {},
	vL;
function WY() {
	if (vL) return fd;
	((vL = 1), Object.defineProperty(fd, '__esModule', { value: !0 }));
	const e = L(),
		r = Yr();
	function n(o, f) {
		(o.push('SEARCH', f.query),
			f.SCORER && (o.push('SCORER', f.SCORER.algorithm), f.SCORER.params && o.push(...f.SCORER.params)),
			f.YIELD_SCORE_AS && o.push('YIELD_SCORE_AS', f.YIELD_SCORE_AS));
	}
	function u(o, f) {
		if ((o.push('VSIM', f.field, f.vectorData), f.method)) {
			if (f.method.KNN) {
				const d = f.method.KNN;
				(o.push('KNN', '1', 'K', d.K.toString()),
					d.EF_RUNTIME !== void 0 && o.push('EF_RUNTIME', d.EF_RUNTIME.toString()),
					d.YIELD_DISTANCE_AS && o.push('YIELD_DISTANCE_AS', d.YIELD_DISTANCE_AS));
			}
			if (f.method.RANGE) {
				const d = f.method.RANGE;
				(o.push('RANGE', '1', 'RADIUS', d.RADIUS.toString()),
					d.EPSILON !== void 0 && o.push('EPSILON', d.EPSILON.toString()),
					d.YIELD_DISTANCE_AS && o.push('YIELD_DISTANCE_AS', d.YIELD_DISTANCE_AS));
			}
		}
		(f.FILTER &&
			(o.push('FILTER', f.FILTER.expression),
			f.FILTER.POLICY &&
				(o.push('POLICY', f.FILTER.POLICY),
				f.FILTER.POLICY === 'BATCHES' && f.FILTER.BATCHES && o.push('BATCHES', 'BATCH_SIZE', f.FILTER.BATCHES.BATCH_SIZE.toString()))),
			f.YIELD_SCORE_AS && o.push('YIELD_SCORE_AS', f.YIELD_SCORE_AS));
	}
	function t(o, f) {
		if (f) {
			if ((o.push('COMBINE'), f.method.RRF)) {
				const d = f.method.RRF;
				(o.push('RRF', d.count.toString()),
					d.WINDOW !== void 0 && o.push('WINDOW', d.WINDOW.toString()),
					d.CONSTANT !== void 0 && o.push('CONSTANT', d.CONSTANT.toString()));
			}
			if (f.method.LINEAR) {
				const d = f.method.LINEAR;
				(o.push('LINEAR', d.count.toString()),
					d.ALPHA !== void 0 && o.push('ALPHA', d.ALPHA.toString()),
					d.BETA !== void 0 && o.push('BETA', d.BETA.toString()));
			}
			(f.method.FUNCTION && o.push('FUNCTION', f.method.FUNCTION), f.YIELD_SCORE_AS && o.push('YIELD_SCORE_AS', f.YIELD_SCORE_AS));
		}
	}
	function i(o, f) {
		if (f) {
			if (
				(f.SEARCH && n(o, f.SEARCH),
				f.VSIM && u(o, f.VSIM),
				f.COMBINE && t(o, f.COMBINE),
				(0, e.parseOptionalVariadicArgument)(o, 'LOAD', f.LOAD),
				f.GROUPBY &&
					((0, e.parseOptionalVariadicArgument)(o, 'GROUPBY', f.GROUPBY.fields),
					f.GROUPBY.REDUCE && (o.push('REDUCE', f.GROUPBY.REDUCE.function, f.GROUPBY.REDUCE.count.toString()), o.push(...f.GROUPBY.REDUCE.args))),
				f.APPLY && o.push('APPLY', f.APPLY.expression, 'AS', f.APPLY.AS),
				f.SORTBY)
			) {
				o.push('SORTBY', f.SORTBY.count.toString());
				for (const d of f.SORTBY.fields) (o.push(d.field), d.direction && o.push(d.direction));
			}
			(f.FILTER && o.push('FILTER', f.FILTER),
				f.LIMIT && o.push('LIMIT', f.LIMIT.offset.toString(), f.LIMIT.num.toString()),
				(0, r.parseParamsArgument)(o, f.PARAMS),
				f.EXPLAINSCORE && o.push('EXPLAINSCORE'),
				f.TIMEOUT !== void 0 && o.push('TIMEOUT', f.TIMEOUT.toString()),
				f.WITHCURSOR &&
					(o.push('WITHCURSOR'),
					f.WITHCURSOR.COUNT !== void 0 && o.push('COUNT', f.WITHCURSOR.COUNT.toString()),
					f.WITHCURSOR.MAXIDLE !== void 0 && o.push('MAXIDLE', f.WITHCURSOR.MAXIDLE.toString())));
		}
	}
	fd.default = {
		NOT_KEYED_COMMAND: !0,
		IS_READ_ONLY: !0,
		parseCommand(o, f, d) {
			(o.push('FT.HYBRID', f), i(o, d));
		},
		transformReply: {
			2: (o) => {
				if (Array.isArray(o) && o.length === 2 && typeof o[1] == 'number') {
					const [f, d] = o;
					return { ...a(f), cursor: d };
				} else return a(o);
			},
			3: void 0
		},
		unstableResp3: !0
	};
	function a(o) {
		const f = o.length > 2 && !Array.isArray(o[2]),
			d = [];
		let _ = 1;
		for (; _ < o.length; ) d.push({ id: o[_++], value: f ? Object.create(null) : s(o[_++]) });
		return { total: o[0], documents: d };
	}
	function s(o) {
		const f = Object.create(null);
		if (!o) return f;
		let d = 0;
		for (; d < o.length; ) {
			const _ = o[d++],
				c = o[d++];
			if (_ === '$')
				try {
					Object.assign(f, JSON.parse(c));
					continue;
				} catch {}
			f[_] = c;
		}
		return f;
	}
	return fd;
}
var dd = {},
	bL;
function xY() {
	if (bL) return dd;
	((bL = 1), Object.defineProperty(dd, '__esModule', { value: !0 }));
	const e = L();
	dd.default = {
		NOT_KEYED_COMMAND: !0,
		IS_READ_ONLY: !0,
		parseCommand(n, u) {
			n.push('FT.INFO', u);
		},
		transformReply: { 2: r, 3: void 0 },
		unstableResp3: !0
	};
	function r(n, u, t) {
		const i = (0, e.createTransformTuplesReplyFunc)(u, t),
			a = {};
		for (let s = 0; s < n.length; s += 2) {
			const o = n[s].toString();
			switch (o) {
				case 'index_name':
				case 'index_options':
				case 'num_docs':
				case 'max_doc_id':
				case 'num_terms':
				case 'num_records':
				case 'total_inverted_index_blocks':
				case 'hash_indexing_failures':
				case 'indexing':
				case 'number_of_uses':
				case 'cleaning':
				case 'stopwords_list':
					a[o] = n[s + 1];
					break;
				case 'inverted_sz_mb':
				case 'vector_index_sz_mb':
				case 'offset_vectors_sz_mb':
				case 'doc_table_size_mb':
				case 'sortable_values_size_mb':
				case 'key_table_size_mb':
				case 'text_overhead_sz_mb':
				case 'tag_overhead_sz_mb':
				case 'total_index_memory_sz_mb':
				case 'geoshapes_sz_mb':
				case 'records_per_doc_avg':
				case 'bytes_per_record_avg':
				case 'offsets_per_term_avg':
				case 'offset_bits_per_record_avg':
				case 'total_indexing_time':
				case 'percent_indexed':
					a[o] = e.transformDoubleReply[2](n[s + 1], void 0, t);
					break;
				case 'index_definition':
					a[o] = i(n[s + 1]);
					break;
				case 'attributes':
					a[o] = n[s + 1].map((f) => i(f));
					break;
				case 'gc_stats': {
					const f = {},
						d = n[s + 1];
					for (let _ = 0; _ < d.length; _ += 2) {
						const c = d[_].toString();
						switch (c) {
							case 'bytes_collected':
							case 'total_ms_run':
							case 'total_cycles':
							case 'average_cycle_time_ms':
							case 'last_run_time_ms':
							case 'gc_numeric_trees_missed':
							case 'gc_blocks_denied':
								f[c] = e.transformDoubleReply[2](d[_ + 1], void 0, t);
								break;
						}
					}
					a[o] = f;
					break;
				}
				case 'cursor_stats': {
					const f = {},
						d = n[s + 1];
					for (let _ = 0; _ < d.length; _ += 2) {
						const c = d[_].toString();
						switch (c) {
							case 'global_idle':
							case 'global_total':
							case 'index_capacity':
							case 'index_total':
								f[c] = d[_ + 1];
								break;
						}
					}
					a[o] = f;
					break;
				}
			}
		}
		return a;
	}
	return dd;
}
var Ne = {},
	gL;
function ZY() {
	if (gL) return Ne;
	gL = 1;
	var e =
			(Ne && Ne.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Ne && Ne.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Ne && Ne.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Ne, '__esModule', { value: !0 });
	const u = n(Yr());
	return (
		(Ne.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(t, i, a, s) {
				(t.push('FT.PROFILE', i, 'SEARCH'), s?.LIMITED && t.push('LIMITED'), t.push('QUERY', a), (0, u.parseSearchOptions)(t, s));
			},
			transformReply: { 2: (t) => ({ results: u.default.transformReply[2](t[0]), profile: t[1] }), 3: (t) => t },
			unstableResp3: !0
		}),
		Ne
	);
}
var Ce = {},
	UL;
function JY() {
	if (UL) return Ce;
	UL = 1;
	var e =
			(Ce && Ce.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Ce && Ce.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Ce && Ce.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Ce, '__esModule', { value: !0 });
	const u = n(Yd());
	return (
		(Ce.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(t, i, a, s) {
				(t.push('FT.PROFILE', i, 'AGGREGATE'), s?.LIMITED && t.push('LIMITED'), t.push('QUERY', a), (0, u.parseAggregateOptions)(t, s));
			},
			transformReply: { 2: (t) => ({ results: u.default.transformReply[2](t[0]), profile: t[1] }), 3: (t) => t },
			unstableResp3: !0
		}),
		Ce
	);
}
var Ar = {},
	GL;
function zY() {
	if (GL) return Ar;
	GL = 1;
	var e =
		(Ar && Ar.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Ar, '__esModule', { value: !0 });
	const r = e(Yr());
	return (
		(Ar.default = {
			NOT_KEYED_COMMAND: r.default.NOT_KEYED_COMMAND,
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(...n) {
				(r.default.parseCommand(...n), n[0].push('NOCONTENT'));
			},
			transformReply: { 2: (n) => ({ total: n[0], documents: n.slice(1) }), 3: void 0 },
			unstableResp3: !0
		}),
		Ar
	);
}
var ld = {},
	YL;
function QY() {
	if (YL) return ld;
	((YL = 1), Object.defineProperty(ld, '__esModule', { value: !0 }));
	const e = $r();
	ld.default = {
		NOT_KEYED_COMMAND: !0,
		IS_READ_ONLY: !0,
		parseCommand(n, u, t, i) {
			if ((n.push('FT.SPELLCHECK', u, t), i?.DISTANCE && n.push('DISTANCE', i.DISTANCE.toString()), i?.TERMS))
				if (Array.isArray(i.TERMS)) for (const a of i.TERMS) r(n, a);
				else r(n, i.TERMS);
			i?.DIALECT ? n.push('DIALECT', i.DIALECT.toString()) : n.push('DIALECT', e.DEFAULT_DIALECT);
		},
		transformReply: {
			2: (n) => n.map(([, u, t]) => ({ term: u, suggestions: t.map(([i, a]) => ({ score: Number(i), suggestion: a })) })),
			3: void 0
		},
		unstableResp3: !0
	};
	function r(n, { mode: u, dictionary: t }) {
		n.push('TERMS', u, t);
	}
	return ld;
}
var cd = {},
	BL;
function kY() {
	return (
		BL ||
			((BL = 1),
			Object.defineProperty(cd, '__esModule', { value: !0 }),
			(cd.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t) {
					(e.push('FT.SUGADD'), e.pushKey(r), e.push(n, u.toString()), t?.INCR && e.push('INCR'), t?.PAYLOAD && e.push('PAYLOAD', t.PAYLOAD));
				},
				transformReply: void 0
			})),
		cd
	);
}
var _d = {},
	qL;
function $Y() {
	return (
		qL ||
			((qL = 1),
			Object.defineProperty(_d, '__esModule', { value: !0 }),
			(_d.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('FT.SUGDEL'), e.pushKey(r), e.push(n));
				},
				transformReply: void 0
			})),
		_d
	);
}
var pr = {},
	Ed = {},
	HL;
function Bd() {
	return (
		HL ||
			((HL = 1),
			Object.defineProperty(Ed, '__esModule', { value: !0 }),
			(Ed.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u) {
					(e.push('FT.SUGGET'), e.pushKey(r), e.push(n), u?.FUZZY && e.push('FUZZY'), u?.MAX !== void 0 && e.push('MAX', u.MAX.toString()));
				},
				transformReply: void 0
			})),
		Ed
	);
}
var jL;
function e1() {
	if (jL) return pr;
	jL = 1;
	var e =
		(pr && pr.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(pr, '__esModule', { value: !0 });
	const r = L(),
		n = e(Bd());
	return (
		(pr.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				(n.default.parseCommand(...u), u[0].push('WITHPAYLOADS'));
			},
			transformReply(u) {
				if ((0, r.isNullReply)(u)) return null;
				const t = new Array(u.length / 2);
				let i = 0,
					a = 0;
				for (; i < u.length; ) t[a++] = { suggestion: u[i++], payload: u[i++] };
				return t;
			}
		}),
		pr
	);
}
var Nr = {},
	FL;
function t1() {
	if (FL) return Nr;
	FL = 1;
	var e =
		(Nr && Nr.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(Nr, '__esModule', { value: !0 });
	const r = L(),
		n = e(Bd());
	return (
		(Nr.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				(n.default.parseCommand(...u), u[0].push('WITHSCORES', 'WITHPAYLOADS'));
			},
			transformReply: {
				2: (u, t, i) => {
					if ((0, r.isNullReply)(u)) return null;
					const a = new Array(u.length / 3);
					let s = 0,
						o = 0;
					for (; s < u.length; ) a[o++] = { suggestion: u[s++], score: r.transformDoubleReply[2](u[s++], t, i), payload: u[s++] };
					return a;
				},
				3: (u) => {
					if ((0, r.isNullReply)(u)) return null;
					const t = new Array(u.length / 3);
					let i = 0,
						a = 0;
					for (; i < u.length; ) t[a++] = { suggestion: u[i++], score: u[i++], payload: u[i++] };
					return t;
				}
			}
		}),
		Nr
	);
}
var Cr = {},
	KL;
function r1() {
	if (KL) return Cr;
	KL = 1;
	var e =
		(Cr && Cr.__importDefault) ||
		function (u) {
			return u && u.__esModule ? u : { default: u };
		};
	Object.defineProperty(Cr, '__esModule', { value: !0 });
	const r = L(),
		n = e(Bd());
	return (
		(Cr.default = {
			IS_READ_ONLY: n.default.IS_READ_ONLY,
			parseCommand(...u) {
				(n.default.parseCommand(...u), u[0].push('WITHSCORES'));
			},
			transformReply: {
				2: (u, t, i) => {
					if ((0, r.isNullReply)(u)) return null;
					const a = new Array(u.length / 2);
					let s = 0,
						o = 0;
					for (; s < u.length; ) a[o++] = { suggestion: u[s++], score: r.transformDoubleReply[2](u[s++], t, i) };
					return a;
				},
				3: (u) => {
					if ((0, r.isNullReply)(u)) return null;
					const t = new Array(u.length / 2);
					let i = 0,
						a = 0;
					for (; i < u.length; ) t[a++] = { suggestion: u[i++], score: u[i++] };
					return t;
				}
			}
		}),
		Cr
	);
}
var Rd = {},
	wL;
function n1() {
	return (
		wL ||
			((wL = 1),
			Object.defineProperty(Rd, '__esModule', { value: !0 }),
			(Rd.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('FT.SUGLEN', r);
				},
				transformReply: void 0
			})),
		Rd
	);
}
var hd = {},
	XL;
function u1() {
	return (
		XL ||
			((XL = 1),
			Object.defineProperty(hd, '__esModule', { value: !0 }),
			(hd.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					e.push('FT.SYNDUMP', r);
				},
				transformReply: {
					2: (e) => {
						const r = {};
						let n = 0;
						for (; n < e.length; ) {
							const u = e[n++].toString(),
								t = e[n++];
							r[u] = t;
						}
						return r;
					},
					3: void 0
				}
			})),
		hd
	);
}
var Sd = {},
	VL;
function i1() {
	return (
		VL ||
			((VL = 1),
			Object.defineProperty(Sd, '__esModule', { value: !0 }),
			(Sd.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n, u, t) {
					(e.push('FT.SYNUPDATE', r, n), t?.SKIPINITIALSCAN && e.push('SKIPINITIALSCAN'), e.pushVariadic(u));
				},
				transformReply: void 0
			})),
		Sd
	);
}
var md = {},
	WL;
function s1() {
	return (
		WL ||
			((WL = 1),
			Object.defineProperty(md, '__esModule', { value: !0 }),
			(md.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					e.push('FT.TAGVALS', r, n);
				},
				transformReply: { 2: void 0, 3: void 0 }
			})),
		md
	);
}
var xL;
function a1() {
	if (xL) return mr;
	xL = 1;
	var e =
		(mr && mr.__importDefault) ||
		function (F) {
			return F && F.__esModule ? F : { default: F };
		};
	Object.defineProperty(mr, '__esModule', { value: !0 });
	const r = e(vY()),
		n = e(bY()),
		u = e(TD()),
		t = e(Yd()),
		i = e(gY()),
		a = e(UY()),
		s = e(GY()),
		o = e(YY()),
		f = e(BY()),
		d = e(ol()),
		_ = e(qY()),
		c = e(HY()),
		R = e(jY()),
		h = e(FY()),
		S = e(KY()),
		O = e(wY()),
		l = e(XY()),
		E = e(VY()),
		T = e(WY()),
		I = e(xY()),
		P = e(ZY()),
		D = e(JY()),
		m = e(zY()),
		A = e(Yr()),
		N = e(QY()),
		C = e(kY()),
		y = e($Y()),
		b = e(e1()),
		U = e(t1()),
		B = e(r1()),
		X = e(Bd()),
		x = e(n1()),
		ne = e(u1()),
		q = e(i1()),
		V = e(s1());
	return (
		(mr.default = {
			_LIST: r.default,
			_list: r.default,
			ALTER: n.default,
			alter: n.default,
			AGGREGATE_WITHCURSOR: u.default,
			aggregateWithCursor: u.default,
			AGGREGATE: t.default,
			aggregate: t.default,
			ALIASADD: i.default,
			aliasAdd: i.default,
			ALIASDEL: a.default,
			aliasDel: a.default,
			ALIASUPDATE: s.default,
			aliasUpdate: s.default,
			CONFIG_GET: o.default,
			configGet: o.default,
			CONFIG_SET: f.default,
			configSet: f.default,
			CREATE: d.default,
			create: d.default,
			CURSOR_DEL: _.default,
			cursorDel: _.default,
			CURSOR_READ: c.default,
			cursorRead: c.default,
			DICTADD: R.default,
			dictAdd: R.default,
			DICTDEL: h.default,
			dictDel: h.default,
			DICTDUMP: S.default,
			dictDump: S.default,
			DROPINDEX: O.default,
			dropIndex: O.default,
			EXPLAIN: l.default,
			explain: l.default,
			EXPLAINCLI: E.default,
			explainCli: E.default,
			HYBRID: T.default,
			hybrid: T.default,
			INFO: I.default,
			info: I.default,
			PROFILESEARCH: P.default,
			profileSearch: P.default,
			PROFILEAGGREGATE: D.default,
			profileAggregate: D.default,
			SEARCH_NOCONTENT: m.default,
			searchNoContent: m.default,
			SEARCH: A.default,
			search: A.default,
			SPELLCHECK: N.default,
			spellCheck: N.default,
			SUGADD: C.default,
			sugAdd: C.default,
			SUGDEL: y.default,
			sugDel: y.default,
			SUGGET_WITHPAYLOADS: b.default,
			sugGetWithPayloads: b.default,
			SUGGET_WITHSCORES_WITHPAYLOADS: U.default,
			sugGetWithScoresWithPayloads: U.default,
			SUGGET_WITHSCORES: B.default,
			sugGetWithScores: B.default,
			SUGGET: X.default,
			sugGet: X.default,
			SUGLEN: x.default,
			sugLen: x.default,
			SYNDUMP: ne.default,
			synDump: ne.default,
			SYNUPDATE: q.default,
			synUpdate: q.default,
			TAGVALS: V.default,
			tagVals: V.default
		}),
		mr
	);
}
var ZL;
function JL() {
	return (
		ZL ||
			((ZL = 1),
			(function (e) {
				var r =
					(xr && xr.__importDefault) ||
					function (i) {
						return i && i.__esModule ? i : { default: i };
					};
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.FT_AGGREGATE_STEPS =
						e.FT_AGGREGATE_GROUP_BY_REDUCERS =
						e.SCHEMA_VECTOR_FIELD_ALGORITHM =
						e.SCHEMA_TEXT_FIELD_PHONETIC =
						e.SCHEMA_FIELD_TYPE =
						e.REDISEARCH_LANGUAGE =
						e.default =
							void 0));
				var n = a1();
				Object.defineProperty(e, 'default', {
					enumerable: !0,
					get: function () {
						return r(n).default;
					}
				});
				var u = ol();
				(Object.defineProperty(e, 'REDISEARCH_LANGUAGE', {
					enumerable: !0,
					get: function () {
						return u.REDISEARCH_LANGUAGE;
					}
				}),
					Object.defineProperty(e, 'SCHEMA_FIELD_TYPE', {
						enumerable: !0,
						get: function () {
							return u.SCHEMA_FIELD_TYPE;
						}
					}),
					Object.defineProperty(e, 'SCHEMA_TEXT_FIELD_PHONETIC', {
						enumerable: !0,
						get: function () {
							return u.SCHEMA_TEXT_FIELD_PHONETIC;
						}
					}),
					Object.defineProperty(e, 'SCHEMA_VECTOR_FIELD_ALGORITHM', {
						enumerable: !0,
						get: function () {
							return u.SCHEMA_VECTOR_FIELD_ALGORITHM;
						}
					}));
				var t = Yd();
				(Object.defineProperty(e, 'FT_AGGREGATE_GROUP_BY_REDUCERS', {
					enumerable: !0,
					get: function () {
						return t.FT_AGGREGATE_GROUP_BY_REDUCERS;
					}
				}),
					Object.defineProperty(e, 'FT_AGGREGATE_STEPS', {
						enumerable: !0,
						get: function () {
							return t.FT_AGGREGATE_STEPS;
						}
					}));
			})(xr)),
		xr
	);
}
var Jr = {},
	Be = {},
	Od = {},
	kd = {},
	zL;
function w() {
	return (
		zL ||
			((zL = 1),
			(function (e) {
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.transformRESP2LabelsWithSources =
						e.transformRESP2Labels =
						e.parseSelectedLabelsArguments =
						e.resp3MapToValue =
						e.resp2MapToValue =
						e.transformSamplesReply =
						e.transformSampleReply =
						e.parseLabelsArgument =
						e.transformTimestampArgument =
						e.parseDuplicatePolicy =
						e.TIME_SERIES_DUPLICATE_POLICIES =
						e.parseChunkSizeArgument =
						e.parseEncodingArgument =
						e.TIME_SERIES_ENCODING =
						e.parseRetentionArgument =
						e.parseIgnoreArgument =
							void 0));
				const r = yd();
				function n(S, O) {
					O !== void 0 && S.push('IGNORE', O.maxTimeDiff.toString(), O.maxValDiff.toString());
				}
				e.parseIgnoreArgument = n;
				function u(S, O) {
					O !== void 0 && S.push('RETENTION', O.toString());
				}
				((e.parseRetentionArgument = u), (e.TIME_SERIES_ENCODING = { COMPRESSED: 'COMPRESSED', UNCOMPRESSED: 'UNCOMPRESSED' }));
				function t(S, O) {
					O !== void 0 && S.push('ENCODING', O);
				}
				e.parseEncodingArgument = t;
				function i(S, O) {
					O !== void 0 && S.push('CHUNK_SIZE', O.toString());
				}
				((e.parseChunkSizeArgument = i),
					(e.TIME_SERIES_DUPLICATE_POLICIES = { BLOCK: 'BLOCK', FIRST: 'FIRST', LAST: 'LAST', MIN: 'MIN', MAX: 'MAX', SUM: 'SUM' }));
				function a(S, O) {
					O !== void 0 && S.push('DUPLICATE_POLICY', O);
				}
				e.parseDuplicatePolicy = a;
				function s(S) {
					return typeof S == 'string' ? S : (typeof S == 'number' ? S : S.getTime()).toString();
				}
				e.transformTimestampArgument = s;
				function o(S, O) {
					if (O) {
						S.push('LABELS');
						for (const [l, E] of Object.entries(O)) S.push(l, E);
					}
				}
				((e.parseLabelsArgument = o),
					(e.transformSampleReply = {
						2(S) {
							const [O, l] = S;
							return { timestamp: O, value: Number(l) };
						},
						3(S) {
							const [O, l] = S;
							return { timestamp: O, value: l };
						}
					}),
					(e.transformSamplesReply = {
						2(S) {
							return S.map((O) => e.transformSampleReply[2](O));
						},
						3(S) {
							return S.map((O) => e.transformSampleReply[3](O));
						}
					}));
				function f(S, O, l) {
					const E = S;
					switch (l?.[r.RESP_TYPES.MAP]) {
						case Map: {
							const T = new Map();
							for (const I of E) {
								const P = I,
									D = P[0];
								T.set(D.toString(), O(P));
							}
							return T;
						}
						case Array: {
							for (const T of E) {
								const I = T;
								I[1] = O(I);
							}
							return E;
						}
						default: {
							const T = Object.create(null);
							for (const I of E) {
								const P = I,
									D = P[0];
								T[D.toString()] = O(P);
							}
							return T;
						}
					}
				}
				e.resp2MapToValue = f;
				function d(S, O) {
					const l = S;
					if (l instanceof Array) for (let E = 1; E < l.length; E += 2) l[E] = O(l[E]);
					else if (l instanceof Map) for (const [E, T] of l.entries()) l.set(E, O(T));
					else for (const [E, T] of Object.entries(l)) l[E] = O(T);
					return l;
				}
				e.resp3MapToValue = d;
				function _(S, O) {
					(S.push('SELECTED_LABELS'), S.pushVariadic(O));
				}
				e.parseSelectedLabelsArguments = _;
				function c(S, O) {
					const l = S;
					switch (O?.[r.RESP_TYPES.MAP]) {
						case Map:
							const E = new Map();
							for (const I of l) {
								const [P, D] = I,
									m = P;
								E.set(m.toString(), D);
							}
							return E;
						case Array:
							return l.flat();
						case Object:
						default:
							const T = Object.create(null);
							for (const I of l) {
								const [P, D] = I,
									m = P;
								T[m.toString()] = D;
							}
							return T;
					}
				}
				e.transformRESP2Labels = c;
				function R(S, O) {
					const l = S,
						E = l.length - 2;
					let T;
					switch (O?.[r.RESP_TYPES.MAP]) {
						case Map:
							const m = new Map();
							for (let N = 0; N < E; N++) {
								const [C, y] = l[N],
									b = C;
								m.set(b.toString(), y);
							}
							T = m;
							break;
						case Array:
							T = l.slice(0, E).flat();
							break;
						case Object:
						default:
							const A = Object.create(null);
							for (let N = 0; N < E; N++) {
								const [C, y] = l[N],
									b = C;
								A[b.toString()] = y;
							}
							T = A;
							break;
					}
					const P = l[l.length - 1],
						D = h(P[1]);
					return { labels: T, sources: D };
				}
				e.transformRESP2LabelsWithSources = R;
				function h(S) {
					const O = S;
					if (typeof O == 'string') return O.split(',');
					const l = O.indexOf(',');
					if (l === -1) return [O];
					const E = [O.subarray(0, l)];
					let T = l + 1;
					for (;;) {
						const I = O.indexOf(',', T);
						if (I === -1) {
							E.push(O.subarray(T));
							break;
						}
						const P = O.subarray(T, I);
						(E.push(P), (T = I + 1));
					}
					return E;
				}
			})(kd)),
		kd
	);
}
var QL;
function o1() {
	if (QL) return Od;
	((QL = 1), Object.defineProperty(Od, '__esModule', { value: !0 }));
	const e = w();
	return (
		(Od.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t, i) {
				(r.push('TS.ADD'),
					r.pushKey(n),
					r.push((0, e.transformTimestampArgument)(u), t.toString()),
					(0, e.parseRetentionArgument)(r, i?.RETENTION),
					(0, e.parseEncodingArgument)(r, i?.ENCODING),
					(0, e.parseChunkSizeArgument)(r, i?.CHUNK_SIZE),
					i?.ON_DUPLICATE && r.push('ON_DUPLICATE', i.ON_DUPLICATE),
					(0, e.parseLabelsArgument)(r, i?.LABELS),
					(0, e.parseIgnoreArgument)(r, i?.IGNORE));
			},
			transformReply: void 0
		}),
		Od
	);
}
var Td = {},
	kL;
function f1() {
	if (kL) return Td;
	((kL = 1), Object.defineProperty(Td, '__esModule', { value: !0 }));
	const e = w();
	return (
		(Td.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('TS.ALTER'),
					r.pushKey(n),
					(0, e.parseRetentionArgument)(r, u?.RETENTION),
					(0, e.parseChunkSizeArgument)(r, u?.CHUNK_SIZE),
					(0, e.parseDuplicatePolicy)(r, u?.DUPLICATE_POLICY),
					(0, e.parseLabelsArgument)(r, u?.LABELS),
					(0, e.parseIgnoreArgument)(r, u?.IGNORE));
			},
			transformReply: void 0
		}),
		Td
	);
}
var Ad = {},
	$L;
function d1() {
	if ($L) return Ad;
	(($L = 1), Object.defineProperty(Ad, '__esModule', { value: !0 }));
	const e = w();
	return (
		(Ad.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u) {
				(r.push('TS.CREATE'),
					r.pushKey(n),
					(0, e.parseRetentionArgument)(r, u?.RETENTION),
					(0, e.parseEncodingArgument)(r, u?.ENCODING),
					(0, e.parseChunkSizeArgument)(r, u?.CHUNK_SIZE),
					(0, e.parseDuplicatePolicy)(r, u?.DUPLICATE_POLICY),
					(0, e.parseLabelsArgument)(r, u?.LABELS),
					(0, e.parseIgnoreArgument)(r, u?.IGNORE));
			},
			transformReply: void 0
		}),
		Ad
	);
}
var Ir = {},
	eM;
function AD() {
	return (
		eM ||
			((eM = 1),
			Object.defineProperty(Ir, '__esModule', { value: !0 }),
			(Ir.TIME_SERIES_AGGREGATION_TYPE = void 0),
			(Ir.TIME_SERIES_AGGREGATION_TYPE = {
				AVG: 'AVG',
				FIRST: 'FIRST',
				LAST: 'LAST',
				MIN: 'MIN',
				MAX: 'MAX',
				SUM: 'SUM',
				RANGE: 'RANGE',
				COUNT: 'COUNT',
				STD_P: 'STD.P',
				STD_S: 'STD.S',
				VAR_P: 'VAR.P',
				VAR_S: 'VAR.S',
				TWA: 'TWA'
			}),
			(Ir.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n, u, t, i) {
					(e.push('TS.CREATERULE'), e.pushKeys([r, n]), e.push('AGGREGATION', u, t.toString()), i !== void 0 && e.push(i.toString()));
				},
				transformReply: void 0
			})),
		Ir
	);
}
var Ie = {},
	Lr = {},
	tM;
function pD() {
	if (tM) return Lr;
	((tM = 1), Object.defineProperty(Lr, '__esModule', { value: !0 }), (Lr.parseIncrByArguments = void 0));
	const e = w();
	function r(n, u, t, i) {
		(n.pushKey(u),
			n.push(t.toString()),
			i?.TIMESTAMP !== void 0 && i?.TIMESTAMP !== null && n.push('TIMESTAMP', (0, e.transformTimestampArgument)(i.TIMESTAMP)),
			(0, e.parseRetentionArgument)(n, i?.RETENTION),
			i?.UNCOMPRESSED && n.push('UNCOMPRESSED'),
			(0, e.parseChunkSizeArgument)(n, i?.CHUNK_SIZE),
			(0, e.parseLabelsArgument)(n, i?.LABELS),
			(0, e.parseIgnoreArgument)(n, i?.IGNORE));
	}
	return (
		(Lr.parseIncrByArguments = r),
		(Lr.default = {
			IS_READ_ONLY: !1,
			parseCommand(...n) {
				(n[0].push('TS.INCRBY'), r(...n));
			},
			transformReply: void 0
		}),
		Lr
	);
}
var rM;
function l1() {
	if (rM) return Ie;
	rM = 1;
	var e =
			(Ie && Ie.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Ie && Ie.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Ie && Ie.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Ie, '__esModule', { value: !0 });
	const u = n(pD());
	return (
		(Ie.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(...t) {
				(t[0].push('TS.DECRBY'), (0, u.parseIncrByArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		Ie
	);
}
var pd = {},
	nM;
function c1() {
	if (nM) return pd;
	((nM = 1), Object.defineProperty(pd, '__esModule', { value: !0 }));
	const e = w();
	return (
		(pd.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n, u, t) {
				(r.push('TS.DEL'), r.pushKey(n), r.push((0, e.transformTimestampArgument)(u), (0, e.transformTimestampArgument)(t)));
			},
			transformReply: void 0
		}),
		pd
	);
}
var Nd = {},
	uM;
function _1() {
	return (
		uM ||
			((uM = 1),
			Object.defineProperty(Nd, '__esModule', { value: !0 }),
			(Nd.default = {
				IS_READ_ONLY: !1,
				parseCommand(e, r, n) {
					(e.push('TS.DELETERULE'), e.pushKeys([r, n]));
				},
				transformReply: void 0
			})),
		Nd
	);
}
var Cd = {},
	iM;
function E1() {
	return (
		iM ||
			((iM = 1),
			Object.defineProperty(Cd, '__esModule', { value: !0 }),
			(Cd.default = {
				IS_READ_ONLY: !0,
				parseCommand(e, r, n) {
					(e.push('TS.GET'), e.pushKey(r), n?.LATEST && e.push('LATEST'));
				},
				transformReply: {
					2(e) {
						return e.length === 0 ? null : { timestamp: e[0], value: Number(e[1]) };
					},
					3(e) {
						return e.length === 0 ? null : { timestamp: e[0], value: e[1] };
					}
				}
			})),
		Cd
	);
}
var Mr = {},
	Id = {},
	sM;
function ND() {
	if (sM) return Id;
	((sM = 1), Object.defineProperty(Id, '__esModule', { value: !0 }));
	const e = L();
	return (
		(Id.default = {
			IS_READ_ONLY: !0,
			parseCommand(r, n) {
				(r.push('TS.INFO'), r.pushKey(n));
			},
			transformReply: {
				2: (r, n, u) => {
					const t = {};
					for (let i = 0; i < r.length; i += 2) {
						const a = r[i].toString();
						switch (a) {
							case 'totalSamples':
							case 'memoryUsage':
							case 'firstTimestamp':
							case 'lastTimestamp':
							case 'retentionTime':
							case 'chunkCount':
							case 'chunkSize':
							case 'chunkType':
							case 'duplicatePolicy':
							case 'sourceKey':
							case 'ignoreMaxTimeDiff':
								t[a] = r[i + 1];
								break;
							case 'labels':
								t[a] = r[i + 1].map(([s, o]) => ({ name: s, value: o }));
								break;
							case 'rules':
								t[a] = r[i + 1].map(([s, o, f]) => ({ key: s, timeBucket: o, aggregationType: f }));
								break;
							case 'ignoreMaxValDiff':
								t[a] = e.transformDoubleReply[2](r[27], void 0, u);
								break;
						}
					}
					return t;
				},
				3: void 0
			},
			unstableResp3: !0
		}),
		Id
	);
}
var aM;
function R1() {
	if (aM) return Mr;
	aM = 1;
	var e =
		(Mr && Mr.__importDefault) ||
		function (n) {
			return n && n.__esModule ? n : { default: n };
		};
	Object.defineProperty(Mr, '__esModule', { value: !0 });
	const r = e(ND());
	return (
		(Mr.default = {
			IS_READ_ONLY: r.default.IS_READ_ONLY,
			parseCommand(n, u) {
				(r.default.parseCommand(n, u), n.push('DEBUG'));
			},
			transformReply: {
				2: (n, u, t) => {
					const i = r.default.transformReply[2](n, u, t);
					for (let a = 0; a < n.length; a += 2) {
						const s = n[a].toString();
						switch (s) {
							case 'keySelfName': {
								i[s] = n[a + 1];
								break;
							}
							case 'Chunks': {
								i.chunks = n[a + 1].map((o) => ({ startTimestamp: o[1], endTimestamp: o[3], samples: o[5], size: o[7], bytesPerSample: o[9] }));
								break;
							}
						}
					}
					return i;
				},
				3: void 0
			},
			unstableResp3: !0
		}),
		Mr
	);
}
var Ld = {},
	oM;
function h1() {
	if (oM) return Ld;
	((oM = 1), Object.defineProperty(Ld, '__esModule', { value: !0 }));
	const e = w();
	return (
		(Ld.default = {
			IS_READ_ONLY: !1,
			parseCommand(r, n) {
				r.push('TS.MADD');
				for (const { key: u, timestamp: t, value: i } of n) (r.pushKey(u), r.push((0, e.transformTimestampArgument)(t), i.toString()));
			},
			transformReply: void 0
		}),
		Ld
	);
}
var Md = {},
	Ze = {},
	fM;
function Ke() {
	if (fM) return Ze;
	((fM = 1), Object.defineProperty(Ze, '__esModule', { value: !0 }), (Ze.parseFilterArgument = Ze.parseLatestArgument = void 0));
	const e = w();
	function r(u, t) {
		t && u.push('LATEST');
	}
	Ze.parseLatestArgument = r;
	function n(u, t) {
		(u.push('FILTER'), u.pushVariadic(t));
	}
	return (
		(Ze.parseFilterArgument = n),
		(Ze.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand(u, t, i) {
				(u.push('TS.MGET'), r(u, i?.LATEST), n(u, t));
			},
			transformReply: {
				2(u, t, i) {
					return (0, e.resp2MapToValue)(u, ([, , a]) => ({ sample: e.transformSampleReply[2](a) }), i);
				},
				3(u) {
					return (0, e.resp3MapToValue)(u, ([, t]) => ({ sample: e.transformSampleReply[3](t) }));
				}
			}
		}),
		Ze
	);
}
var Dr = {},
	dM;
function CD() {
	if (dM) return Dr;
	((dM = 1), Object.defineProperty(Dr, '__esModule', { value: !0 }), (Dr.createTransformMGetLabelsReply = void 0));
	const e = Ke(),
		r = w();
	function n() {
		return {
			2(u, t, i) {
				return (0, r.resp2MapToValue)(u, ([, a, s]) => ({ labels: (0, r.transformRESP2Labels)(a), sample: r.transformSampleReply[2](s) }), i);
			},
			3(u) {
				return (0, r.resp3MapToValue)(u, ([t, i]) => ({ labels: t, sample: r.transformSampleReply[3](i) }));
			}
		};
	}
	return (
		(Dr.createTransformMGetLabelsReply = n),
		(Dr.default = {
			IS_READ_ONLY: !0,
			parseCommand(u, t, i) {
				(u.push('TS.MGET'), (0, e.parseLatestArgument)(u, i?.LATEST), u.push('WITHLABELS'), (0, e.parseFilterArgument)(u, t));
			},
			transformReply: n()
		}),
		Dr
	);
}
var lM;
function S1() {
	if (lM) return Md;
	((lM = 1), Object.defineProperty(Md, '__esModule', { value: !0 }));
	const e = Ke(),
		r = w(),
		n = CD();
	return (
		(Md.default = {
			IS_READ_ONLY: !0,
			parseCommand(u, t, i, a) {
				(u.push('TS.MGET'), (0, e.parseLatestArgument)(u, a?.LATEST), (0, r.parseSelectedLabelsArguments)(u, i), (0, e.parseFilterArgument)(u, t));
			},
			transformReply: (0, n.createTransformMGetLabelsReply)()
		}),
		Md
	);
}
var $ = {},
	Le = {},
	cM;
function we() {
	if (cM) return Le;
	((cM = 1),
		Object.defineProperty(Le, '__esModule', { value: !0 }),
		(Le.transformRangeArguments = Le.parseRangeArguments = Le.TIME_SERIES_BUCKET_TIMESTAMP = void 0));
	const e = w();
	Le.TIME_SERIES_BUCKET_TIMESTAMP = { LOW: '-', MIDDLE: '~', END: '+' };
	function r(u, t, i, a) {
		if ((u.push((0, e.transformTimestampArgument)(t), (0, e.transformTimestampArgument)(i)), a?.LATEST && u.push('LATEST'), a?.FILTER_BY_TS)) {
			u.push('FILTER_BY_TS');
			for (const s of a.FILTER_BY_TS) u.push((0, e.transformTimestampArgument)(s));
		}
		(a?.FILTER_BY_VALUE && u.push('FILTER_BY_VALUE', a.FILTER_BY_VALUE.min.toString(), a.FILTER_BY_VALUE.max.toString()),
			a?.COUNT !== void 0 && u.push('COUNT', a.COUNT.toString()),
			a?.AGGREGATION &&
				(a?.ALIGN !== void 0 && u.push('ALIGN', (0, e.transformTimestampArgument)(a.ALIGN)),
				u.push('AGGREGATION', a.AGGREGATION.type, (0, e.transformTimestampArgument)(a.AGGREGATION.timeBucket)),
				a.AGGREGATION.BUCKETTIMESTAMP && u.push('BUCKETTIMESTAMP', a.AGGREGATION.BUCKETTIMESTAMP),
				a.AGGREGATION.EMPTY && u.push('EMPTY')));
	}
	Le.parseRangeArguments = r;
	function n(u, t, i, a, s) {
		(u.pushKey(t), r(u, i, a, s));
	}
	return (
		(Le.transformRangeArguments = n),
		(Le.default = {
			IS_READ_ONLY: !0,
			parseCommand(...u) {
				(u[0].push('TS.RANGE'), n(...u));
			},
			transformReply: {
				2(u) {
					return e.transformSamplesReply[2](u);
				},
				3(u) {
					return e.transformSamplesReply[3](u);
				}
			}
		}),
		Le
	);
}
var _M;
function en() {
	if (_M) return $;
	((_M = 1),
		Object.defineProperty($, '__esModule', { value: !0 }),
		($.extractResp3MRangeSources = $.createTransformMRangeGroupByArguments = $.parseGroupByArguments = $.TIME_SERIES_REDUCERS = void 0));
	const e = w(),
		r = we(),
		n = Ke();
	$.TIME_SERIES_REDUCERS = {
		AVG: 'AVG',
		SUM: 'SUM',
		MIN: 'MIN',
		MAX: 'MAX',
		RANGE: 'RANGE',
		COUNT: 'COUNT',
		STD_P: 'STD.P',
		STD_S: 'STD.S',
		VAR_P: 'VAR.P',
		VAR_S: 'VAR.S'
	};
	function u(a, s) {
		a.push('GROUPBY', s.label, 'REDUCE', s.REDUCE);
	}
	$.parseGroupByArguments = u;
	function t(a) {
		return (s, o, f, d, _, c) => {
			(s.push(a), (0, r.parseRangeArguments)(s, o, f, c), (0, n.parseFilterArgument)(s, d), u(s, _));
		};
	}
	$.createTransformMRangeGroupByArguments = t;
	function i(a) {
		const s = a;
		return s instanceof Map ? s.get('sources') : s instanceof Array ? s[1] : s.sources;
	}
	return (
		($.extractResp3MRangeSources = i),
		($.default = {
			IS_READ_ONLY: !0,
			parseCommand: t('TS.MRANGE'),
			transformReply: {
				2(a, s, o) {
					return (0, e.resp2MapToValue)(a, ([f, d, _]) => ({ samples: e.transformSamplesReply[2](_) }), o);
				},
				3(a) {
					return (0, e.resp3MapToValue)(a, ([s, o, f, d]) => ({ sources: i(f), samples: e.transformSamplesReply[3](d) }));
				}
			}
		}),
		$
	);
}
var Je = {},
	yr = {},
	EM;
function fl() {
	if (EM) return yr;
	((EM = 1), Object.defineProperty(yr, '__esModule', { value: !0 }), (yr.createTransformMRangeSelectedLabelsArguments = void 0));
	const e = w(),
		r = we(),
		n = Ke();
	function u(t) {
		return (i, a, s, o, f, d) => {
			(i.push(t), (0, r.parseRangeArguments)(i, a, s, d), (0, e.parseSelectedLabelsArguments)(i, o), (0, n.parseFilterArgument)(i, f));
		};
	}
	return (
		(yr.createTransformMRangeSelectedLabelsArguments = u),
		(yr.default = {
			IS_READ_ONLY: !0,
			parseCommand: u('TS.MRANGE'),
			transformReply: {
				2(t, i, a) {
					return (0, e.resp2MapToValue)(t, ([s, o, f]) => ({ labels: (0, e.transformRESP2Labels)(o, a), samples: e.transformSamplesReply[2](f) }), a);
				},
				3(t) {
					return (0, e.resp3MapToValue)(t, ([i, a, s]) => ({ labels: a, samples: e.transformSamplesReply[3](s) }));
				}
			}
		}),
		yr
	);
}
var RM;
function ID() {
	if (RM) return Je;
	RM = 1;
	var e =
		(Je && Je.__importDefault) ||
		function (s) {
			return s && s.__esModule ? s : { default: s };
		};
	(Object.defineProperty(Je, '__esModule', { value: !0 }), (Je.createMRangeSelectedLabelsGroupByTransformArguments = void 0));
	const r = w(),
		n = we(),
		u = en(),
		t = Ke(),
		i = e(fl());
	function a(s) {
		return (o, f, d, _, c, R, h) => {
			(o.push(s),
				(0, n.parseRangeArguments)(o, f, d, h),
				(0, r.parseSelectedLabelsArguments)(o, _),
				(0, t.parseFilterArgument)(o, c),
				(0, u.parseGroupByArguments)(o, R));
		};
	}
	return (
		(Je.createMRangeSelectedLabelsGroupByTransformArguments = a),
		(Je.default = {
			IS_READ_ONLY: !0,
			parseCommand: a('TS.MRANGE'),
			transformReply: {
				2: i.default.transformReply[2],
				3(s) {
					return (0, r.resp3MapToValue)(s, ([o, f, d, _]) => ({
						labels: o,
						sources: (0, u.extractResp3MRangeSources)(d),
						samples: r.transformSamplesReply[3](_)
					}));
				}
			}
		}),
		Je
	);
}
var Pr = {},
	hM;
function LD() {
	if (hM) return Pr;
	((hM = 1), Object.defineProperty(Pr, '__esModule', { value: !0 }), (Pr.createMRangeWithLabelsGroupByTransformArguments = void 0));
	const e = w(),
		r = we(),
		n = en(),
		u = Ke();
	function t(i) {
		return (a, s, o, f, d, _) => {
			(a.push(i), (0, r.parseRangeArguments)(a, s, o, _), a.push('WITHLABELS'), (0, u.parseFilterArgument)(a, f), (0, n.parseGroupByArguments)(a, d));
		};
	}
	return (
		(Pr.createMRangeWithLabelsGroupByTransformArguments = t),
		(Pr.default = {
			IS_READ_ONLY: !0,
			parseCommand: t('TS.MRANGE'),
			transformReply: {
				2(i, a, s) {
					return (0, e.resp2MapToValue)(
						i,
						([o, f, d]) => {
							const _ = (0, e.transformRESP2LabelsWithSources)(f);
							return { labels: _.labels, sources: _.sources, samples: e.transformSamplesReply[2](d) };
						},
						s
					);
				},
				3(i) {
					return (0, e.resp3MapToValue)(i, ([a, s, o, f]) => ({
						labels: a,
						sources: (0, n.extractResp3MRangeSources)(o),
						samples: e.transformSamplesReply[3](f)
					}));
				}
			}
		}),
		Pr
	);
}
var vr = {},
	SM;
function MD() {
	if (SM) return vr;
	((SM = 1), Object.defineProperty(vr, '__esModule', { value: !0 }), (vr.createTransformMRangeWithLabelsArguments = void 0));
	const e = w(),
		r = we(),
		n = Ke();
	function u(t) {
		return (i, a, s, o, f) => {
			(i.push(t), (0, r.parseRangeArguments)(i, a, s, f), i.push('WITHLABELS'), (0, n.parseFilterArgument)(i, o));
		};
	}
	return (
		(vr.createTransformMRangeWithLabelsArguments = u),
		(vr.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand: u('TS.MRANGE'),
			transformReply: {
				2(t, i, a) {
					return (0, e.resp2MapToValue)(
						t,
						([s, o, f]) => {
							const d = o,
								_ = Object.create(null);
							for (const c of d) {
								const [R, h] = c,
									S = R;
								_[S.toString()] = h;
							}
							return { labels: _, samples: e.transformSamplesReply[2](f) };
						},
						a
					);
				},
				3(t) {
					return (0, e.resp3MapToValue)(t, ([i, a, s]) => ({ labels: i, samples: e.transformSamplesReply[3](s) }));
				}
			}
		}),
		vr
	);
}
var br = {},
	mM;
function DD() {
	if (mM) return br;
	((mM = 1), Object.defineProperty(br, '__esModule', { value: !0 }), (br.createTransformMRangeArguments = void 0));
	const e = w(),
		r = we(),
		n = Ke();
	function u(t) {
		return (i, a, s, o, f) => {
			(i.push(t), (0, r.parseRangeArguments)(i, a, s, f), (0, n.parseFilterArgument)(i, o));
		};
	}
	return (
		(br.createTransformMRangeArguments = u),
		(br.default = {
			NOT_KEYED_COMMAND: !0,
			IS_READ_ONLY: !0,
			parseCommand: u('TS.MRANGE'),
			transformReply: {
				2(t, i, a) {
					return (0, e.resp2MapToValue)(t, ([s, o, f]) => e.transformSamplesReply[2](f), a);
				},
				3(t) {
					return (0, e.resp3MapToValue)(t, ([i, a, s]) => e.transformSamplesReply[3](s));
				}
			}
		}),
		br
	);
}
var Me = {},
	OM;
function m1() {
	if (OM) return Me;
	OM = 1;
	var e =
			(Me && Me.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Me && Me.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Me && Me.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Me, '__esModule', { value: !0 });
	const u = n(en());
	return (
		(Me.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand: (0, u.createTransformMRangeGroupByArguments)('TS.MREVRANGE'),
			transformReply: u.default.transformReply
		}),
		Me
	);
}
var De = {},
	TM;
function O1() {
	if (TM) return De;
	TM = 1;
	var e =
			(De && De.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(De && De.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(De && De.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(De, '__esModule', { value: !0 });
	const u = n(ID());
	return (
		(De.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand: (0, u.createMRangeSelectedLabelsGroupByTransformArguments)('TS.MREVRANGE'),
			transformReply: u.default.transformReply
		}),
		De
	);
}
var ye = {},
	AM;
function T1() {
	if (AM) return ye;
	AM = 1;
	var e =
			(ye && ye.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(ye && ye.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(ye && ye.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(ye, '__esModule', { value: !0 });
	const u = n(fl());
	return (
		(ye.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand: (0, u.createTransformMRangeSelectedLabelsArguments)('TS.MREVRANGE'),
			transformReply: u.default.transformReply
		}),
		ye
	);
}
var Pe = {},
	pM;
function A1() {
	if (pM) return Pe;
	pM = 1;
	var e =
			(Pe && Pe.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(Pe && Pe.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(Pe && Pe.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(Pe, '__esModule', { value: !0 });
	const u = n(LD());
	return (
		(Pe.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand: (0, u.createMRangeWithLabelsGroupByTransformArguments)('TS.MREVRANGE'),
			transformReply: u.default.transformReply
		}),
		Pe
	);
}
var ve = {},
	NM;
function p1() {
	if (NM) return ve;
	NM = 1;
	var e =
			(ve && ve.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(ve && ve.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(ve && ve.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(ve, '__esModule', { value: !0 });
	const u = n(MD());
	return (
		(ve.default = {
			NOT_KEYED_COMMAND: u.default.NOT_KEYED_COMMAND,
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand: (0, u.createTransformMRangeWithLabelsArguments)('TS.MREVRANGE'),
			transformReply: u.default.transformReply
		}),
		ve
	);
}
var be = {},
	CM;
function N1() {
	if (CM) return be;
	CM = 1;
	var e =
			(be && be.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(be && be.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(be && be.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(be, '__esModule', { value: !0 });
	const u = n(DD());
	return (
		(be.default = {
			NOT_KEYED_COMMAND: u.default.NOT_KEYED_COMMAND,
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand: (0, u.createTransformMRangeArguments)('TS.MREVRANGE'),
			transformReply: u.default.transformReply
		}),
		be
	);
}
var Dd = {},
	IM;
function C1() {
	return (
		IM ||
			((IM = 1),
			Object.defineProperty(Dd, '__esModule', { value: !0 }),
			(Dd.default = {
				NOT_KEYED_COMMAND: !0,
				IS_READ_ONLY: !0,
				parseCommand(e, r) {
					(e.push('TS.QUERYINDEX'), e.pushVariadic(r));
				},
				transformReply: { 2: void 0, 3: void 0 }
			})),
		Dd
	);
}
var ge = {},
	LM;
function I1() {
	if (LM) return ge;
	LM = 1;
	var e =
			(ge && ge.__createBinding) ||
			(Object.create
				? function (t, i, a, s) {
						s === void 0 && (s = a);
						var o = Object.getOwnPropertyDescriptor(i, a);
						((!o || ('get' in o ? !i.__esModule : o.writable || o.configurable)) &&
							(o = {
								enumerable: !0,
								get: function () {
									return i[a];
								}
							}),
							Object.defineProperty(t, s, o));
					}
				: function (t, i, a, s) {
						(s === void 0 && (s = a), (t[s] = i[a]));
					}),
		r =
			(ge && ge.__setModuleDefault) ||
			(Object.create
				? function (t, i) {
						Object.defineProperty(t, 'default', { enumerable: !0, value: i });
					}
				: function (t, i) {
						t.default = i;
					}),
		n =
			(ge && ge.__importStar) ||
			function (t) {
				if (t && t.__esModule) return t;
				var i = {};
				if (t != null) for (var a in t) a !== 'default' && Object.prototype.hasOwnProperty.call(t, a) && e(i, t, a);
				return (r(i, t), i);
			};
	Object.defineProperty(ge, '__esModule', { value: !0 });
	const u = n(we());
	return (
		(ge.default = {
			IS_READ_ONLY: u.default.IS_READ_ONLY,
			parseCommand(...t) {
				(t[0].push('TS.REVRANGE'), (0, u.transformRangeArguments)(...t));
			},
			transformReply: u.default.transformReply
		}),
		ge
	);
}
var MM;
function L1() {
	return (
		MM ||
			((MM = 1),
			(function (e) {
				var r =
						(Be && Be.__createBinding) ||
						(Object.create
							? function (q, V, F, Q) {
									Q === void 0 && (Q = F);
									var k = Object.getOwnPropertyDescriptor(V, F);
									((!k || ('get' in k ? !V.__esModule : k.writable || k.configurable)) &&
										(k = {
											enumerable: !0,
											get: function () {
												return V[F];
											}
										}),
										Object.defineProperty(q, Q, k));
								}
							: function (q, V, F, Q) {
									(Q === void 0 && (Q = F), (q[Q] = V[F]));
								}),
					n =
						(Be && Be.__exportStar) ||
						function (q, V) {
							for (var F in q) F !== 'default' && !Object.prototype.hasOwnProperty.call(V, F) && r(V, q, F);
						},
					u =
						(Be && Be.__importDefault) ||
						function (q) {
							return q && q.__esModule ? q : { default: q };
						};
				Object.defineProperty(e, '__esModule', { value: !0 });
				const t = u(o1()),
					i = u(f1()),
					a = u(d1()),
					s = u(AD()),
					o = u(l1()),
					f = u(c1()),
					d = u(_1()),
					_ = u(E1()),
					c = u(pD()),
					R = u(R1()),
					h = u(ND()),
					S = u(h1()),
					O = u(S1()),
					l = u(CD()),
					E = u(Ke()),
					T = u(en()),
					I = u(ID()),
					P = u(fl()),
					D = u(LD()),
					m = u(MD()),
					A = u(DD()),
					N = u(m1()),
					C = u(O1()),
					y = u(T1()),
					b = u(A1()),
					U = u(p1()),
					B = u(N1()),
					X = u(C1()),
					x = u(we()),
					ne = u(I1());
				(n(w(), e),
					(e.default = {
						ADD: t.default,
						add: t.default,
						ALTER: i.default,
						alter: i.default,
						CREATE: a.default,
						create: a.default,
						CREATERULE: s.default,
						createRule: s.default,
						DECRBY: o.default,
						decrBy: o.default,
						DEL: f.default,
						del: f.default,
						DELETERULE: d.default,
						deleteRule: d.default,
						GET: _.default,
						get: _.default,
						INCRBY: c.default,
						incrBy: c.default,
						INFO_DEBUG: R.default,
						infoDebug: R.default,
						INFO: h.default,
						info: h.default,
						MADD: S.default,
						mAdd: S.default,
						MGET_SELECTED_LABELS: O.default,
						mGetSelectedLabels: O.default,
						MGET_WITHLABELS: l.default,
						mGetWithLabels: l.default,
						MGET: E.default,
						mGet: E.default,
						MRANGE_GROUPBY: T.default,
						mRangeGroupBy: T.default,
						MRANGE_SELECTED_LABELS_GROUPBY: I.default,
						mRangeSelectedLabelsGroupBy: I.default,
						MRANGE_SELECTED_LABELS: P.default,
						mRangeSelectedLabels: P.default,
						MRANGE_WITHLABELS_GROUPBY: D.default,
						mRangeWithLabelsGroupBy: D.default,
						MRANGE_WITHLABELS: m.default,
						mRangeWithLabels: m.default,
						MRANGE: A.default,
						mRange: A.default,
						MREVRANGE_GROUPBY: N.default,
						mRevRangeGroupBy: N.default,
						MREVRANGE_SELECTED_LABELS_GROUPBY: C.default,
						mRevRangeSelectedLabelsGroupBy: C.default,
						MREVRANGE_SELECTED_LABELS: y.default,
						mRevRangeSelectedLabels: y.default,
						MREVRANGE_WITHLABELS_GROUPBY: b.default,
						mRevRangeWithLabelsGroupBy: b.default,
						MREVRANGE_WITHLABELS: U.default,
						mRevRangeWithLabels: U.default,
						MREVRANGE: B.default,
						mRevRange: B.default,
						QUERYINDEX: X.default,
						queryIndex: X.default,
						RANGE: x.default,
						range: x.default,
						REVRANGE: ne.default,
						revRange: ne.default
					}));
			})(Be)),
		Be
	);
}
var DM;
function yM() {
	return (
		DM ||
			((DM = 1),
			(function (e) {
				var r =
					(Jr && Jr.__importDefault) ||
					function (a) {
						return a && a.__esModule ? a : { default: a };
					};
				(Object.defineProperty(e, '__esModule', { value: !0 }),
					(e.TIME_SERIES_REDUCERS =
						e.TIME_SERIES_BUCKET_TIMESTAMP =
						e.TIME_SERIES_AGGREGATION_TYPE =
						e.TIME_SERIES_DUPLICATE_POLICIES =
						e.TIME_SERIES_ENCODING =
						e.default =
							void 0));
				var n = L1();
				(Object.defineProperty(e, 'default', {
					enumerable: !0,
					get: function () {
						return r(n).default;
					}
				}),
					Object.defineProperty(e, 'TIME_SERIES_ENCODING', {
						enumerable: !0,
						get: function () {
							return n.TIME_SERIES_ENCODING;
						}
					}),
					Object.defineProperty(e, 'TIME_SERIES_DUPLICATE_POLICIES', {
						enumerable: !0,
						get: function () {
							return n.TIME_SERIES_DUPLICATE_POLICIES;
						}
					}));
				var u = AD();
				Object.defineProperty(e, 'TIME_SERIES_AGGREGATION_TYPE', {
					enumerable: !0,
					get: function () {
						return u.TIME_SERIES_AGGREGATION_TYPE;
					}
				});
				var t = we();
				Object.defineProperty(e, 'TIME_SERIES_BUCKET_TIMESTAMP', {
					enumerable: !0,
					get: function () {
						return t.TIME_SERIES_BUCKET_TIMESTAMP;
					}
				});
				var i = en();
				Object.defineProperty(e, 'TIME_SERIES_REDUCERS', {
					enumerable: !0,
					get: function () {
						return i.TIME_SERIES_REDUCERS;
					}
				});
			})(Jr)),
		Jr
	);
}
var PM;
function M1() {
	return (
		PM ||
			((PM = 1),
			(function (e) {
				var r =
						(Ue && Ue.__createBinding) ||
						(Object.create
							? function (h, S, O, l) {
									l === void 0 && (l = O);
									var E = Object.getOwnPropertyDescriptor(S, O);
									((!E || ('get' in E ? !S.__esModule : E.writable || E.configurable)) &&
										(E = {
											enumerable: !0,
											get: function () {
												return S[O];
											}
										}),
										Object.defineProperty(h, l, E));
								}
							: function (h, S, O, l) {
									(l === void 0 && (l = O), (h[l] = S[O]));
								}),
					n =
						(Ue && Ue.__exportStar) ||
						function (h, S) {
							for (var O in h) O !== 'default' && !Object.prototype.hasOwnProperty.call(S, O) && r(S, h, O);
						},
					u =
						(Ue && Ue.__importDefault) ||
						function (h) {
							return h && h.__esModule ? h : { default: h };
						};
				(Object.defineProperty(e, '__esModule', { value: !0 }), (e.createSentinel = e.createCluster = e.createClientPool = e.createClient = void 0));
				const t = yd(),
					i = u(qI()),
					a = u(dL()),
					s = u(JL()),
					o = u(yM());
				(n(yd(), e), n(qI(), e), n(dL(), e), n(JL(), e), n(yM(), e));
				const f = { ...i.default, json: a.default, ft: s.default, ts: o.default };
				function d(h) {
					return (0, t.createClient)({ ...h, modules: { ...f, ...h?.modules } });
				}
				e.createClient = d;
				function _(h, S) {
					return (0, t.createClientPool)({ ...h, modules: { ...f, ...h?.modules } }, S);
				}
				e.createClientPool = _;
				function c(h) {
					return (0, t.createCluster)({ ...h, modules: { ...f, ...h?.modules } });
				}
				e.createCluster = c;
				function R(h) {
					return (0, t.createSentinel)({ ...h, modules: { ...f, ...h?.modules } });
				}
				e.createSentinel = R;
			})(Ue)),
		Ue
	);
}
var D1 = M1();
const F1 = jD({ __proto__: null }, [D1]);
export { F1 as i };
//# sourceMappingURL=DDa23TWh.js.map
