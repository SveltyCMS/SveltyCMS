import { ac as I, G as U, aT as W, aU as z, h as L, B as M, aV as j, aW as O, aQ as q, I as G, A as w, aX as P, aY as K } from './DrlZFkx8.js';
import { j as Q } from './CTjXDULS.js';
const V = () => performance.now(),
	$ = { tick: (r) => requestAnimationFrame(r), now: () => V(), tasks: new Set() };
function B() {
	const r = $.now();
	($.tasks.forEach((t) => {
		t.c(r) || ($.tasks.delete(t), t.f());
	}),
		$.tasks.size !== 0 && $.tick(B));
}
function X(r) {
	let t;
	return (
		$.tasks.size === 0 && $.tick(B),
		{
			promise: new Promise((n) => {
				$.tasks.add((t = { c: r, f: n }));
			}),
			abort() {
				$.tasks.delete(t);
			}
		}
	);
}
function x(r, t) {
	O(() => {
		r.dispatchEvent(new CustomEvent(t));
	});
}
function Y(r) {
	if (r === 'float') return 'cssFloat';
	if (r === 'offset') return 'cssOffset';
	if (r.startsWith('--')) return r;
	const t = r.split('-');
	return t.length === 1
		? t[0]
		: t[0] +
				t
					.slice(1)
					.map((n) => n[0].toUpperCase() + n.slice(1))
					.join('');
}
function N(r) {
	const t = {},
		n = r.split(';');
	for (const e of n) {
		const [s, a] = e.split(':');
		if (!s || a === void 0) break;
		const f = Y(s.trim());
		t[f] = a.trim();
	}
	return t;
}
const D = (r) => r;
function tt(r, t, n) {
	var e = I,
		s = e.nodes,
		a,
		f,
		c,
		v = null;
	((s.a ??= {
		element: r,
		measure() {
			a = this.element.getBoundingClientRect();
		},
		apply() {
			if (
				(c?.abort(), (f = this.element.getBoundingClientRect()), a.left !== f.left || a.right !== f.right || a.top !== f.top || a.bottom !== f.bottom)
			) {
				const i = t()(this.element, { from: a, to: f }, n?.());
				c = F(this.element, i, void 0, 1, () => {
					(c?.abort(), (c = void 0));
				});
			}
		},
		fix() {
			if (!r.getAnimations().length) {
				var { position: i, width: p, height: g } = getComputedStyle(r);
				if (i !== 'absolute' && i !== 'fixed') {
					var o = r.style;
					((v = { position: o.position, width: o.width, height: o.height, transform: o.transform }),
						(o.position = 'absolute'),
						(o.width = p),
						(o.height = g));
					var h = r.getBoundingClientRect();
					if (a.left !== h.left || a.top !== h.top) {
						var l = `translate(${a.left - h.left}px, ${a.top - h.top}px)`;
						o.transform = o.transform ? `${o.transform} ${l}` : l;
					}
				}
			}
		},
		unfix() {
			if (v) {
				var i = r.style;
				((i.position = v.position), (i.width = v.width), (i.height = v.height), (i.transform = v.transform));
			}
		}
	}),
		(s.a.element = r));
}
function rt(r, t, n, e) {
	var s = (r & P) !== 0,
		a = (r & K) !== 0,
		f = s && a,
		c = (r & j) !== 0,
		v = f ? 'both' : s ? 'in' : 'out',
		i,
		p = t.inert,
		g = t.style.overflow,
		o,
		h;
	function l() {
		return O(() => (i ??= n()(t, e?.() ?? {}, { direction: v })));
	}
	var d = {
			is_global: c,
			in() {
				if (((t.inert = p), !s)) {
					(h?.abort(), h?.reset?.());
					return;
				}
				(a || o?.abort(),
					x(t, 'introstart'),
					(o = F(t, l(), h, 1, () => {
						(x(t, 'introend'), o?.abort(), (o = i = void 0), (t.style.overflow = g));
					})));
			},
			out(y) {
				if (!a) {
					(y?.(), (i = void 0));
					return;
				}
				((t.inert = !0),
					x(t, 'outrostart'),
					(h = F(t, l(), o, 0, () => {
						(x(t, 'outroend'), y?.());
					})));
			},
			stop: () => {
				(o?.abort(), h?.abort());
			}
		},
		_ = I;
	if (((_.nodes.t ??= []).push(d), s && Q)) {
		var u = c;
		if (!u) {
			for (var m = _.parent; m && (m.f & U) !== 0; ) for (; (m = m.parent) && (m.f & W) === 0; );
			u = !m || (m.f & z) !== 0;
		}
		u &&
			L(() => {
				M(() => d.in());
			});
	}
}
function F(r, t, n, e, s) {
	var a = e === 1;
	if (q(t)) {
		var f,
			c = !1;
		return (
			G(() => {
				if (!c) {
					var _ = t({ direction: a ? 'in' : 'out' });
					f = F(r, _, n, e, s);
				}
			}),
			{
				abort: () => {
					((c = !0), f?.abort());
				},
				deactivate: () => f.deactivate(),
				reset: () => f.reset(),
				t: () => f.t()
			}
		);
	}
	if ((n?.deactivate(), !t?.duration)) return (s(), { abort: w, deactivate: w, reset: w, t: () => e });
	const { delay: v = 0, css: i, tick: p, easing: g = D } = t;
	var o = [];
	if (a && n === void 0 && (p && p(0, 1), i)) {
		var h = N(i(0, 1));
		o.push(h, h);
	}
	var l = () => 1 - e,
		d = r.animate(o, { duration: v, fill: 'forwards' });
	return (
		(d.onfinish = () => {
			d.cancel();
			var _ = n?.t() ?? 1 - e;
			n?.abort();
			var u = e - _,
				m = t.duration * Math.abs(u),
				y = [];
			if (m > 0) {
				var k = !1;
				if (i)
					for (var S = Math.ceil(m / 16.666666666666668), C = 0; C <= S; C += 1) {
						var A = _ + u * g(C / S),
							E = N(i(A, 1 - A));
						(y.push(E), (k ||= E.overflow === 'hidden'));
					}
				(k && (r.style.overflow = 'hidden'),
					(l = () => {
						var b = d.currentTime;
						return _ + u * g(b / m);
					}),
					p &&
						X(() => {
							if (d.playState !== 'running') return !1;
							var b = l();
							return (p(b, 1 - b), !0);
						}));
			}
			((d = r.animate(y, { duration: m, fill: 'forwards' })),
				(d.onfinish = () => {
					((l = () => e), p?.(e, 1 - e), s());
				}));
		}),
		{
			abort: () => {
				d && (d.cancel(), (d.effect = null), (d.onfinish = w));
			},
			deactivate: () => {
				s = w;
			},
			reset: () => {
				e === 0 && p?.(1, 0);
			},
			t: () => l()
		}
	);
}
const H = (r) => r;
function T(r) {
	const t = r - 1;
	return t * t * t + 1;
}
function R(r) {
	const t = typeof r == 'string' && r.match(/^\s*(-?[\d.]+)([^\s]*)\s*$/);
	return t ? [parseFloat(t[1]), t[2] || 'px'] : [r, 'px'];
}
function at(r, { delay: t = 0, duration: n = 400, easing: e = H } = {}) {
	const s = +getComputedStyle(r).opacity;
	return { delay: t, duration: n, easing: e, css: (a) => `opacity: ${a * s}` };
}
function it(r, { delay: t = 0, duration: n = 400, easing: e = T, x: s = 0, y: a = 0, opacity: f = 0 } = {}) {
	const c = getComputedStyle(r),
		v = +c.opacity,
		i = c.transform === 'none' ? '' : c.transform,
		p = v * (1 - f),
		[g, o] = R(s),
		[h, l] = R(a);
	return {
		delay: t,
		duration: n,
		easing: e,
		css: (d, _) => `
			transform: ${i} translate(${(1 - d) * g}${o}, ${(1 - d) * h}${l});
			opacity: ${v - p * _}`
	};
}
function ot(r, { delay: t = 0, duration: n = 400, easing: e = T, axis: s = 'y' } = {}) {
	const a = getComputedStyle(r),
		f = +a.opacity,
		c = s === 'y' ? 'height' : 'width',
		v = parseFloat(a[c]),
		i = s === 'y' ? ['top', 'bottom'] : ['left', 'right'],
		p = i.map((u) => `${u[0].toUpperCase()}${u.slice(1)}`),
		g = parseFloat(a[`padding${p[0]}`]),
		o = parseFloat(a[`padding${p[1]}`]),
		h = parseFloat(a[`margin${p[0]}`]),
		l = parseFloat(a[`margin${p[1]}`]),
		d = parseFloat(a[`border${p[0]}Width`]),
		_ = parseFloat(a[`border${p[1]}Width`]);
	return {
		delay: t,
		duration: n,
		easing: e,
		css: (u) =>
			`overflow: hidden;opacity: ${Math.min(u * 20, 1) * f};${c}: ${u * v}px;padding-${i[0]}: ${u * g}px;padding-${i[1]}: ${u * o}px;margin-${i[0]}: ${u * h}px;margin-${i[1]}: ${u * l}px;border-${i[0]}-width: ${u * d}px;border-${i[1]}-width: ${u * _}px;min-${c}: 0`
	};
}
function nt(r, { delay: t = 0, duration: n = 400, easing: e = T, start: s = 0, opacity: a = 0 } = {}) {
	const f = getComputedStyle(r),
		c = +f.opacity,
		v = f.transform === 'none' ? '' : f.transform,
		i = 1 - s,
		p = c * (1 - a);
	return {
		delay: t,
		duration: n,
		easing: e,
		css: (g, o) => `
			transform: ${v} scale(${1 - i * o});
			opacity: ${c - p * o}
		`
	};
}
export { nt as a, tt as b, it as c, at as f, ot as s, rt as t };
//# sourceMappingURL=0XeaN6pZ.js.map
