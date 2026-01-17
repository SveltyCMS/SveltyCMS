new TextEncoder();
const r = new TextDecoder();
function c(o) {
	const t = atob(o),
		n = new Uint8Array(t.length);
	for (let e = 0; e < t.length; e++) n[e] = t.charCodeAt(e);
	return n;
}
export { c as b, r as t };
//# sourceMappingURL=B17Q6ahh.js.map
