import { A as b, B as m, F as q, aE as A } from './DrlZFkx8.js';
function _(e, t, n) {
	if (e == null) return (t(void 0), n && n(void 0), b);
	const r = m(() => e.subscribe(t, n));
	return r.unsubscribe ? () => r.unsubscribe() : r;
}
const f = [];
function x(e, t) {
	return { subscribe: z(e, t).subscribe };
}
function z(e, t = b) {
	let n = null;
	const r = new Set();
	function i(u) {
		if (q(e, u) && ((e = u), n)) {
			const o = !f.length;
			for (const s of r) (s[1](), f.push(s, e));
			if (o) {
				for (let s = 0; s < f.length; s += 2) f[s][0](f[s + 1]);
				f.length = 0;
			}
		}
	}
	function a(u) {
		i(u(e));
	}
	function l(u, o = b) {
		const s = [u, o];
		return (
			r.add(s),
			r.size === 1 && (n = t(i, a) || b),
			u(e),
			() => {
				(r.delete(s), r.size === 0 && n && (n(), (n = null)));
			}
		);
	}
	return { set: i, update: a, subscribe: l };
}
function E(e, t, n) {
	const r = !Array.isArray(e),
		i = r ? [e] : e;
	if (!i.every(Boolean)) throw new Error('derived() expects stores as input, got a falsy value');
	const a = t.length < 2;
	return x(n, (l, u) => {
		let o = !1;
		const s = [];
		let d = 0,
			p = b;
		const y = () => {
				if (d) return;
				p();
				const c = t(r ? s[0] : s, l, u);
				a ? l(c) : (p = typeof c == 'function' ? c : b);
			},
			h = i.map((c, g) =>
				_(
					c,
					(w) => {
						((s[g] = w), (d &= ~(1 << g)), o && y());
					},
					() => {
						d |= 1 << g;
					}
				)
			);
		return (
			(o = !0),
			y(),
			function () {
				(A(h), p(), (o = !1));
			}
		);
	});
}
function k(e) {
	let t;
	return (_(e, (n) => (t = n))(), t);
}
export { E as d, k as g, _ as s, z as w };
//# sourceMappingURL=DvgRl2rN.js.map
