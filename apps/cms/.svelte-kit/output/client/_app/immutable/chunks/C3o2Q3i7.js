import { i as h, a as w, p as A, b as E } from './DHPSYX_z.js';
function L(t) {
	const r = JSON.parse(t);
	return (r.data && (r.data = A(r.data, E.decoders)), r);
}
function l(t) {
	return HTMLElement.prototype.cloneNode.call(t);
}
function H(t, r = () => {}) {
	const p = async ({ action: a, result: c, reset: o = !0, invalidateAll: i = !0 }) => {
		(c.type === 'success' && (o && HTMLFormElement.prototype.reset.call(t), i && (await h())),
			(location.origin + location.pathname === a.origin + a.pathname || c.type === 'redirect' || c.type === 'error') && (await w(c)));
	};
	async function d(a) {
		if ((a.submitter?.hasAttribute('formmethod') ? a.submitter.formMethod : l(t).method) !== 'post') return;
		a.preventDefault();
		const o = new URL(a.submitter?.hasAttribute('formaction') ? a.submitter.formAction : l(t).action),
			i = a.submitter?.hasAttribute('formenctype') ? a.submitter.formEnctype : l(t).enctype,
			s = new FormData(t, a.submitter),
			u = new AbortController();
		let m = !1;
		const b = (await r({ action: o, cancel: () => (m = !0), controller: u, formData: s, formElement: t, submitter: a.submitter })) ?? p;
		if (m) return;
		let n;
		try {
			const e = new Headers({ accept: 'application/json', 'x-sveltekit-action': 'true' });
			i !== 'multipart/form-data' &&
				e.set('Content-Type', /^(:?application\/x-www-form-urlencoded|text\/plain)$/.test(i) ? i : 'application/x-www-form-urlencoded');
			const y = i === 'multipart/form-data' ? s : new URLSearchParams(s),
				f = await fetch(o, { method: 'POST', headers: e, cache: 'no-store', body: y, signal: u.signal });
			((n = L(await f.text())), n.type === 'error' && (n.status = f.status));
		} catch (e) {
			if (e?.name === 'AbortError') return;
			n = { type: 'error', error: e };
		}
		await b({
			action: o,
			formData: s,
			formElement: t,
			update: (e) => p({ action: o, result: n, reset: e?.reset, invalidateAll: e?.invalidateAll }),
			result: n
		});
	}
	return (
		HTMLFormElement.prototype.addEventListener.call(t, 'submit', d),
		{
			destroy() {
				HTMLFormElement.prototype.removeEventListener.call(t, 'submit', d);
			}
		}
	);
}
export { L as d, H as e };
//# sourceMappingURL=C3o2Q3i7.js.map
