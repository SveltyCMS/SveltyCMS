import { l as o } from './BvngfGKt.js';
function i(e) {
	if (typeof e != 'string') return !1;
	const t = new Date(e);
	return !isNaN(t.getTime()) && t.toISOString() === e;
}
function a(e) {
	const t = e.toISOString();
	if (!i(t)) throw new Error('Invalid date conversion');
	return t;
}
function f() {
	return a(new Date());
}
function g(e) {
	return new Date(e);
}
function l(e, t = 'en', n = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) {
	try {
		let r;
		return (
			typeof e == 'number' ? (r = new Date(e > 1e12 ? e : e * 1e3)) : typeof e == 'string' ? (r = new Date(e)) : (r = e),
			isNaN(r.getTime()) ? 'Invalid Date' : new Intl.DateTimeFormat(t, n).format(r)
		);
	} catch (r) {
		return (o.error('Error formatting date:', r), 'Invalid Date');
	}
}
const c = Object.freeze(Object.defineProperty({ __proto__: null }, Symbol.toStringTag, { value: 'Module' })),
	m = Object.freeze(Object.defineProperty({ __proto__: null }, Symbol.toStringTag, { value: 'Module' }));
export { c as _, m as a, a as d, l as f, g as i, f as n };
//# sourceMappingURL=B_fImZOG.js.map
