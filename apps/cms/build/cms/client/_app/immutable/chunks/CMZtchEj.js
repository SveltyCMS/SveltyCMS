import {
	aq as d,
	k as b,
	ar as v,
	as as o,
	z as y,
	at as n,
	au as i,
	av as g,
	Q as x,
	aw as u,
	B as l,
	ax as h,
	ao as C,
	ay as w,
	az as k,
	aA as S,
	aB as A,
	aC as z,
	aD as D,
	a9 as j
} from './DrlZFkx8.js';
import { i as q, m as B, u as E } from './CTjXDULS.js';
import { c as M } from './DhHAlOU0.js';
function O(t, e) {
	if ((d(), b)) {
		const a = window.__svelte?.h;
		if (a?.has(t)) return a.get(t);
		v();
	}
	return e();
}
function P() {
	return (i === null && g(), (i.ac ??= new AbortController()).signal);
}
function f(t) {
	(n === null && o(),
		y(() => {
			const e = l(t);
			if (typeof e == 'function') return e;
		}));
}
function U(t) {
	(n === null && o(), f(() => () => l(t)));
}
function $(t, e, { bubbles: a = !1, cancelable: r = !1 } = {}) {
	return new CustomEvent(t, { detail: e, bubbles: a, cancelable: r });
}
function Q() {
	const t = n;
	return (
		t === null && o(),
		(e, a, r) => {
			const s = t.s.$$events?.[e];
			if (s) {
				const p = x(s) ? s.slice() : [s],
					c = $(e, a, r);
				for (const m of p) m.call(t.x, c);
				return !c.defaultPrevented;
			}
			return !0;
		}
	);
}
function R(t) {
	(n === null && o(), n.l === null && u(), _(n).b.push(t));
}
function T(t) {
	(n === null && o(), n.l === null && u(), _(n).a.push(t));
}
function _(t) {
	var e = t.l;
	return (e.u ??= { a: [], b: [], m: [] });
}
const I = Object.freeze(
	Object.defineProperty(
		{
			__proto__: null,
			afterUpdate: T,
			beforeUpdate: R,
			createContext: h,
			createEventDispatcher: Q,
			createRawSnippet: M,
			flushSync: C,
			fork: w,
			getAbortSignal: P,
			getAllContexts: k,
			getContext: S,
			hasContext: A,
			hydratable: O,
			hydrate: q,
			mount: B,
			onDestroy: U,
			onMount: f,
			setContext: z,
			settled: D,
			tick: j,
			unmount: E,
			untrack: l
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
export { U as a, f as o, I as s };
//# sourceMappingURL=CMZtchEj.js.map
