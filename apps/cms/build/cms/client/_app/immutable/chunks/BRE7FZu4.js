import { d as r, x as s, g as d, b as o } from './DrlZFkx8.js';
var i = ((e) => ((e.XS = 'XS'), (e.SM = 'SM'), (e.MD = 'MD'), (e.LG = 'LG'), (e.XL = 'XL'), (e.XXL = '2XL'), e))(i || {});
const n = { SM: 640, MD: 768, LG: 1024, XL: 1280, '2XL': 1536 };
function c(e) {
	return e < n.SM ? 'XS' : e < n.MD ? 'SM' : e < n.LG ? 'MD' : e < n.XL ? 'LG' : e < n['2XL'] ? 'XL' : '2XL';
}
class w {
	#e = r(s(typeof window < 'u' ? window.innerWidth : 1024));
	get width() {
		return d(this.#e);
	}
	set width(t) {
		o(this.#e, t, !0);
	}
	#t = r(s(typeof window < 'u' ? window.innerHeight : 768));
	get height() {
		return d(this.#t);
	}
	set height(t) {
		o(this.#t, t, !0);
	}
	#i = r(s(typeof window < 'u' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : !1));
	get prefersReducedMotion() {
		return d(this.#i);
	}
	set prefersReducedMotion(t) {
		o(this.#i, t, !0);
	}
	get size() {
		return c(this.width);
	}
	get isMobile() {
		return this.size === i.XS || this.size === i.SM;
	}
	get isTablet() {
		return this.size === i.MD;
	}
	get isDesktop() {
		const t = this.size;
		return t === i.LG || t === i.XL || t === i.XXL;
	}
	get isLargeScreen() {
		return this.size === i.XL || this.size === i.XXL;
	}
	rafId = null;
	cleanup;
	constructor() {
		if (typeof window > 'u') return;
		const t = () => {
				((this.width = window.innerWidth), (this.height = window.innerHeight), (this.rafId = null));
			},
			h = () => {
				(this.rafId && cancelAnimationFrame(this.rafId), (this.rafId = requestAnimationFrame(t)));
			},
			a = window.matchMedia('(prefers-reduced-motion: reduce)'),
			u = (f) => {
				this.prefersReducedMotion = f.matches;
			};
		(window.addEventListener('resize', h),
			a.addEventListener('change', u),
			t(),
			(this.cleanup = () => {
				(this.rafId && cancelAnimationFrame(this.rafId), window.removeEventListener('resize', h), a.removeEventListener('change', u));
			}));
	}
	destroy() {
		this.cleanup?.();
	}
}
const g = new w();
export { i as S, g as s };
//# sourceMappingURL=BRE7FZu4.js.map
