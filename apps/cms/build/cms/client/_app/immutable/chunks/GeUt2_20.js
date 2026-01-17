import { d as i, g as a, b as c } from './DrlZFkx8.js';
class r {
	#t = i(null);
	get active() {
		return a(this.#t);
	}
	set active(t) {
		c(this.#t, t, !0);
	}
	get isOpen() {
		return this.active !== null;
	}
	trigger(t, e = {}, s) {
		this.active = { component: t, props: e, response: s };
	}
	close(t) {
		(this.active?.response && t !== void 0 && this.active.response(t), (this.active = null));
	}
	clear() {
		this.active = null;
	}
}
const o = new r();
export { o as modalState };
//# sourceMappingURL=GeUt2_20.js.map
