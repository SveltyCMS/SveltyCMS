import { x as y, d as c, aR as p, R as b, g as n, b as a, aS as u } from './DrlZFkx8.js';
import { l as o } from './BvngfGKt.js';
const d = y({});
let h = null;
async function E() {
	try {
		const i = await fetch('/api/settings/public');
		if (i.ok) {
			const e = await i.json();
			Object.assign(d, e);
		}
	} catch (i) {
		o.error('Failed to fetch public settings:', i);
	}
}
function _() {
	if (!h && !window.location.pathname.startsWith('/login'))
		try {
			((h = new EventSource('/api/settings/public/stream')),
				h.addEventListener('message', async (i) => {
					try {
						const e = JSON.parse(i.data);
						e.type === 'connected'
							? o.debug('Connected to settings stream')
							: e.type === 'update' && (o.debug('Settings updated, fetching new values...'), await E());
					} catch (e) {
						o.error('Failed to process settings update:', e);
					}
				}),
				h.addEventListener('error', (i) => {
					o.warn('Settings stream connection error, will auto-reconnect...', i);
				}));
		} catch (i) {
			o.error('Failed to start settings listener:', i);
		}
}
function M(i) {
	(Object.assign(d, i), _());
}
function L(i) {
	return d[i];
}
const P = d;
var x = ['forEach', 'isDisjointFrom', 'isSubsetOf', 'isSupersetOf'],
	O = ['difference', 'intersection', 'symmetricDifference', 'union'],
	m = !1;
class v extends Set {
	#t = new Map();
	#e = c(0);
	#s = c(0);
	#n = p || -1;
	constructor(e) {
		if ((super(), e)) {
			for (var s of e) super.add(s);
			this.#s.v = super.size;
		}
		m || this.#i();
	}
	#r(e) {
		return p === this.#n ? c(e) : b(e);
	}
	#i() {
		m = !0;
		var e = v.prototype,
			s = Set.prototype;
		for (const t of x)
			e[t] = function (...r) {
				return (n(this.#e), s[t].apply(this, r));
			};
		for (const t of O)
			e[t] = function (...r) {
				n(this.#e);
				var l = s[t].apply(this, r);
				return new v(l);
			};
	}
	has(e) {
		var s = super.has(e),
			t = this.#t,
			r = t.get(e);
		if (r === void 0) {
			if (!s) return (n(this.#e), !1);
			((r = this.#r(!0)), t.set(e, r));
		}
		return (n(r), s);
	}
	add(e) {
		return (super.has(e) || (super.add(e), a(this.#s, super.size), u(this.#e)), this);
	}
	delete(e) {
		var s = super.delete(e),
			t = this.#t,
			r = t.get(e);
		return (r !== void 0 && (t.delete(e), a(r, !1)), s && (a(this.#s, super.size), u(this.#e)), s);
	}
	clear() {
		if (super.size !== 0) {
			super.clear();
			var e = this.#t;
			for (var s of e.values()) a(s, !1);
			(e.clear(), a(this.#s, 0), u(this.#e));
		}
	}
	keys() {
		return this.values();
	}
	values() {
		return (n(this.#e), super.values());
	}
	entries() {
		return (n(this.#e), super.entries());
	}
	[Symbol.iterator]() {
		return this.keys();
	}
	get size() {
		return n(this.#s);
	}
}
class D extends Map {
	#t = new Map();
	#e = c(0);
	#s = c(0);
	#n = p || -1;
	constructor(e) {
		if ((super(), e)) {
			for (var [s, t] of e) super.set(s, t);
			this.#s.v = super.size;
		}
	}
	#r(e) {
		return p === this.#n ? c(e) : b(e);
	}
	has(e) {
		var s = this.#t,
			t = s.get(e);
		if (t === void 0) {
			var r = super.get(e);
			if (r !== void 0) ((t = this.#r(0)), s.set(e, t));
			else return (n(this.#e), !1);
		}
		return (n(t), !0);
	}
	forEach(e, s) {
		(this.#i(), super.forEach(e, s));
	}
	get(e) {
		var s = this.#t,
			t = s.get(e);
		if (t === void 0) {
			var r = super.get(e);
			if (r !== void 0) ((t = this.#r(0)), s.set(e, t));
			else {
				n(this.#e);
				return;
			}
		}
		return (n(t), super.get(e));
	}
	set(e, s) {
		var t = this.#t,
			r = t.get(e),
			l = super.get(e),
			S = super.set(e, s),
			f = this.#e;
		if (r === void 0) ((r = this.#r(0)), t.set(e, r), a(this.#s, super.size), u(f));
		else if (l !== s) {
			u(r);
			var g = f.reactions === null ? null : new Set(f.reactions),
				z = g === null || !r.reactions?.every((w) => g.has(w));
			z && u(f);
		}
		return S;
	}
	delete(e) {
		var s = this.#t,
			t = s.get(e),
			r = super.delete(e);
		return (t !== void 0 && (s.delete(e), a(this.#s, super.size), a(t, -1), u(this.#e)), r);
	}
	clear() {
		if (super.size !== 0) {
			super.clear();
			var e = this.#t;
			a(this.#s, 0);
			for (var s of e.values()) a(s, -1);
			(u(this.#e), e.clear());
		}
	}
	#i() {
		n(this.#e);
		var e = this.#t;
		if (this.#s.v !== e.size) {
			for (var s of super.keys())
				if (!e.has(s)) {
					var t = this.#r(0);
					e.set(s, t);
				}
		}
		for ([, t] of this.#t) n(t);
	}
	keys() {
		return (n(this.#e), super.keys());
	}
	values() {
		return (this.#i(), super.values());
	}
	entries() {
		return (this.#i(), super.entries());
	}
	[Symbol.iterator]() {
		return this.entries();
	}
	get size() {
		return (n(this.#s), super.size);
	}
}
export { v as S, D as a, L as g, M as i, P as p };
//# sourceMappingURL=C9E6SjbS.js.map
