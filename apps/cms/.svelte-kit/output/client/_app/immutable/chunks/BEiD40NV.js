import { h as d, B as n, D as u, E as c, F as p } from './DrlZFkx8.js';
function y(s, o, r) {
	d(() => {
		var a = n(() => o(s, r?.()) || {});
		if (r && a?.update) {
			var t = !1,
				f = {};
			(u(() => {
				var e = r();
				(c(e), t && p(f, e) && ((f = e), a.update(e)));
			}),
				(t = !0));
		}
		if (a?.destroy) return () => a.destroy();
	});
}
export { y as a };
//# sourceMappingURL=BEiD40NV.js.map
