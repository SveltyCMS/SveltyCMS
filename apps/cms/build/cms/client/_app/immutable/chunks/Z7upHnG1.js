import './DtH1sEIR.js';
function u(t, a, m) {
	const i = m.getAbsoluteTransform().copy().invert(),
		n = i.point({ x: t.x, y: t.y }),
		s = i.point({ x: t.x + t.width, y: t.y + t.height }),
		o = a.width(),
		h = a.height(),
		x = o / 2,
		r = h / 2,
		e = Math.max(0, Math.min(o, Math.round(n.x + x))),
		c = Math.max(0, Math.min(h, Math.round(n.y + r))),
		M = Math.max(1, Math.min(o - e, Math.round(s.x - n.x))),
		y = Math.max(1, Math.min(h - c, Math.round(s.y - n.y)));
	return { x: e, y: c, width: M, height: y };
}
export { u as stageRectToImageRect };
//# sourceMappingURL=Z7upHnG1.js.map
