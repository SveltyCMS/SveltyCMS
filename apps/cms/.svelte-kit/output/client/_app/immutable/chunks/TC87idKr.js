import { c as O } from './Ccw7PXcW.js';
function b(a, { from: t, to: r }, p = {}) {
	var { delay: u = 0, duration: n = (i) => Math.sqrt(i) * 120, easing: y = O } = p,
		s = getComputedStyle(a),
		f = s.transform === 'none' ? '' : s.transform,
		[h, v] = s.transformOrigin.split(' ').map(parseFloat);
	((h /= a.clientWidth), (v /= a.clientHeight));
	var c = W(a),
		g = a.clientWidth / r.width / c,
		d = a.clientHeight / r.height / c,
		x = t.left + t.width * h,
		m = t.top + t.height * v,
		w = r.left + r.width * h,
		S = r.top + r.height * v,
		l = (x - w) * g,
		o = (m - S) * d,
		$ = t.width / r.width,
		z = t.height / r.height;
	return {
		delay: u,
		duration: typeof n == 'function' ? n(Math.sqrt(l * l + o * o)) : n,
		easing: y,
		css: (i, e) => {
			var C = e * l,
				q = e * o,
				H = i + e * $,
				M = i + e * z;
			return `transform: ${f} translate(${C}px, ${q}px) scale(${H}, ${M});`;
		}
	};
}
function W(a) {
	if ('currentCSSZoom' in a) return a.currentCSSZoom;
	for (var t = a, r = 1; t !== null; ) ((r *= +getComputedStyle(t).zoom), (t = t.parentElement));
	return r;
}
export { b as f };
//# sourceMappingURL=TC87idKr.js.map
