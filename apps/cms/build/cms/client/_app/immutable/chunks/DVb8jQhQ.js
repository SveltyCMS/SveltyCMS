import { l as s } from './BvngfGKt.js';
import './C9E6SjbS.js';
async function o(t, r) {
	try {
		const e = await fetch(t, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...r });
		if (!e.ok) {
			const n = await e.json().catch(() => ({ error: `HTTP error! Status: ${e.status}` }));
			throw new Error(n.error || 'An unknown error occurred.');
		}
		return await e.json();
	} catch (e) {
		const n = e;
		return (s.error('[API Client Error]', n), { success: !1, error: n.message });
	}
}
function d(t, r) {
	return o(`/api/collections/${t}`, { method: 'POST', body: JSON.stringify(r) });
}
function u(t, r, e) {
	return o(`/api/collections/${t}/${r}`, { method: 'PATCH', body: JSON.stringify(e) });
}
function f(t, r) {
	const { ids: e, status: n, ...i } = r;
	if (n && e && Array.isArray(e))
		return o(`/api/collections/${t}/${e[0]}/status`, { method: 'PATCH', body: JSON.stringify({ status: n, entries: e, ...i }) });
	throw new Error('Batch updates only supported for status changes');
}
function h(t, r, e) {
	return o(`/api/collections/${t}/${r}/status`, { method: 'PATCH', body: JSON.stringify({ status: e }) });
}
function p(t, r) {
	return o(`/api/collections/${t}/${r}`, { method: 'DELETE' });
}
function y(t, r) {
	return o(`/api/collections/${t}/batch`, { method: 'POST', body: JSON.stringify({ action: 'delete', entryIds: r }) });
}
function m(t, r) {
	return o(`/api/collections/${t}/batch-clone`, { method: 'POST', body: JSON.stringify({ entries: r }) });
}
const a = new Map();
function $(t) {
	const r = t.trim().toLowerCase();
	for (const [e] of a.entries()) e.includes(`"collectionId":"${r}"`) && a.delete(e);
	s.info(`[Cache] Invalidated for collection ${t}`);
}
async function g(t = {}) {
	const e = `/api/collections?${new URLSearchParams(t).toString()}`;
	return o(e, { method: 'GET' });
}
export { h as a, m as b, d as c, p as d, f as e, y as f, g, $ as i, u };
//# sourceMappingURL=DVb8jQhQ.js.map
