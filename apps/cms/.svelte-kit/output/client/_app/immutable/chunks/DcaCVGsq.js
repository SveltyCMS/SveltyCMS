import './zi73tRJP.js';
import { p as u, s as l, c as n, r as i, a as f } from './DrlZFkx8.js';
import { f as v, a as b, d as p } from './CTjXDULS.js';
import { modalState as d } from './GeUt2_20.js';
var _ = v(
	'<div class="card p-4 w-modal shadow-xl space-y-4"><header class="text-2xl font-bold">Edit Menu Item</header> <p>Menu Item Editor Placeholder</p> <div class="flex justify-end gap-2"><button class="btn preset-outlined-surface-500">Cancel</button> <button class="btn preset-filled-primary-500">Save</button></div></div>'
);
function M(s, a) {
	u(a, !0);
	function c() {
		(d.close(), a.meta.onSave && a.meta.onSave(a.meta.item._fields));
	}
	function r() {
		(d.close(), a.meta.onCancel && a.meta.onCancel());
	}
	var e = _(),
		t = l(n(e), 4),
		o = n(t);
	o.__click = r;
	var m = l(o, 2);
	((m.__click = c), i(t), i(e), b(s, e), f());
}
p(['click']);
export { M as default };
//# sourceMappingURL=DcaCVGsq.js.map
