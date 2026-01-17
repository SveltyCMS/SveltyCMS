const __vite__mapDeps = (
	i,
	m = __vite__mapDeps,
	d = m.f || (m.f = ['../chunks/Jwj1YebI.js', '../chunks/DtH1sEIR.js', '../chunks/DrlZFkx8.js', '../chunks/rsSWfq8L.js'])
) => i.map((i) => d[i]);
import { i as K } from '../chunks/zi73tRJP.js';
import {
	p as le,
	g as t,
	u as Pt,
	s as r,
	c as i,
	t as $,
	a as ce,
	d as V,
	r as a,
	b as o,
	f as ct,
	n as nt,
	x as Me,
	z as je,
	aA as Oa,
	A as La,
	aC as Wa
} from '../chunks/DrlZFkx8.js';
import { d as Ee, f as C, s as at, a as h, c as Zt, e as Ve, t as qe, r as ma } from '../chunks/CTjXDULS.js';
import { e as Be, i as Ke } from '../chunks/BXe5mj2j.js';
import { b as l, c as wt, a as ye, r as Kt, h as Ze, g as Pa, s as Ye, e as sa, d as Ba } from '../chunks/MEFvoR_D.js';
import { b as Re, c as Ha } from '../chunks/D4QnGYgQ.js';
import { g as ga } from '../chunks/DHPSYX_z.js';
import { a as Xa } from '../chunks/B9ygI19o.js';
import { l as Va } from '../chunks/-PV6rnhC.js';
import { g as na, l as ra } from '../chunks/7IKENDK9.js';
import { l as qt } from '../chunks/BvngfGKt.js';
import { p as va } from '../chunks/C9E6SjbS.js';
import { p as Tt, b as Ya } from '../chunks/DePHBZW_.js';
import { P as Ja } from '../chunks/C6jjkVLf.js';
import { c as be } from '../chunks/7bh91wXp.js';
import { t as la, a as ba, f as za } from '../chunks/0XeaN6pZ.js';
import { f as ta } from '../chunks/D3eWcrZU.js';
import { q as ya } from '../chunks/Ccw7PXcW.js';
import { a as _a } from '../chunks/BEiD40NV.js';
import { t as se } from '../chunks/C-hhfhAN.js';
import { T as fe } from '../chunks/CPMcYF9a.js';
import { P as ea } from '../chunks/Kpla-k0W.js';
import { T as qa } from '../chunks/B0T_vZHe.js';
import { T as Ka } from '../chunks/DqR3GK4e.js';
import { T as Za } from '../chunks/_e9Aq20d.js';
import { o as Ma, a as Qa } from '../chunks/CMZtchEj.js';
import { b as ca } from '../chunks/YQp2a1pQ.js';
import { K as it, i as y } from '../chunks/DtH1sEIR.js';
import { _ as $a } from '../chunks/PPVm8Dsz.js';
import { s as ti } from '../chunks/BSPmpUse.js';
import { s as ei } from '../chunks/DhHAlOU0.js';
import { modalState as oa } from '../chunks/GeUt2_20.js';
import { b as xa } from '../chunks/Cl42wY7v.js';
import { h as ai } from '../chunks/IGLJqrie.js';
var $e = ((D) => ((D.Image = 'image'), (D.Video = 'video'), (D.Audio = 'audio'), (D.Document = 'document'), (D.RemoteVideo = 'remoteVideo'), D))(
		$e || {}
	),
	ii = C(
		'<button class="flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors hover:bg-surface-100 focus:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-surface-800 dark:focus:bg-surface-800" aria-label="Show all breadcrumb items" type="button"><iconify-icon></iconify-icon></button>',
		2
	),
	ni = C('<iconify-icon></iconify-icon> <span class="max-w-[150px] truncate"> </span>', 3),
	ri = C('<iconify-icon></iconify-icon> <span class="max-w-[150px] truncate"> </span>', 3),
	oi = C('<button type="button"><!></button>'),
	si = C('<span class="mx-1 text-gray-400 dark:text-gray-600" aria-hidden="true"><iconify-icon></iconify-icon></span>', 2),
	li = C('<li class="flex items-center" role="listitem"><!> <!></li>'),
	ci = C(
		'<nav aria-label="Breadcrumb navigation" class="flex items-center gap-2"><ol class="flex flex-wrap items-center gap-1 text-sm text-gray-700 dark:text-gray-300" role="list"></ol> <button class="btn-icon btn-icon-sm preset-outlined-surface-500 ml-auto" title="Copy path to clipboard" aria-label="Copy current path to clipboard" type="button"><iconify-icon></iconify-icon></button> <div class="sr-only" role="status" aria-live="polite"> </div></nav>',
		2
	);
function di(D, e) {
	le(e, !0);
	const n = Tt(e, 'maxVisible', 3, 5);
	let s = V(!1);
	const c = Pt(() => e.breadcrumb.length > n() && !t(s)),
		v = Pt(() => () => (!t(c) || t(s) ? e.breadcrumb : [e.breadcrumb[0], '...', ...e.breadcrumb.slice(-2)])),
		b = Pt(() => () => (!t(c) || t(s) ? e.breadcrumb.map((k, E) => E) : [0, -1, e.breadcrumb.length - 2, e.breadcrumb.length - 1]));
	function u(k) {
		const E = t(b)()[k];
		if (E === -1) {
			o(s, !0);
			return;
		}
		if (E === 0) e.openFolder(null);
		else {
			const m = e.folders[E];
			e.openFolder(m ? m._id : null);
		}
	}
	async function d() {
		const k = e.breadcrumb.join(' > ');
		try {
			await navigator.clipboard.writeText(k);
		} catch (E) {
			console.error('Failed to copy path:', E);
		}
	}
	function _(k, E) {
		(k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), u(E));
	}
	var f = ci(),
		g = i(f);
	(Be(
		g,
		21,
		() => t(v)(),
		Ke,
		(k, E, m) => {
			const z = Pt(() => t(b)()[m]),
				S = Pt(() => m === t(v)().length - 1),
				T = Pt(() => t(z) === -1);
			var M = li(),
				p = i(M);
			{
				var G = (Q) => {
						var dt = ii();
						dt.__click = () => o(s, !0);
						var lt = i(dt);
						(l(lt, 'icon', 'mdi:dots-horizontal'),
							l(lt, 'width', '18'),
							wt(lt, 1, 'text-surface-500'),
							l(lt, 'aria-hidden', 'true'),
							a(dt),
							h(Q, dt));
					},
					L = (Q) => {
						var dt = oi();
						((dt.__click = () => u(m)), (dt.__keydown = (H) => _(H, m)));
						var lt = i(dt);
						{
							var X = (H) => {
									var W = ni(),
										x = ct(W);
									(l(x, 'icon', 'mdi:home'),
										l(x, 'width', '18'),
										wt(x, 1, 'shrink-0 text-tertiary-500 dark:text-primary-500'),
										l(x, 'aria-hidden', 'true'));
									var B = r(x, 2),
										q = i(B, !0);
									(a(B), $(() => at(q, t(E))), h(H, W));
								},
								P = (H) => {
									var W = ri(),
										x = ct(W);
									(l(x, 'icon', 'mdi:folder'),
										l(x, 'width', '18'),
										wt(x, 1, 'shrink-0 text-tertiary-500 dark:text-primary-500'),
										l(x, 'aria-hidden', 'true'));
									var B = r(x, 2),
										q = i(B, !0);
									(a(B), $(() => at(q, t(E))), h(H, W));
								};
							K(lt, (H) => {
								t(z) === 0 ? H(X) : H(P, !1);
							});
						}
						(a(dt),
							$(() => {
								(wt(
									dt,
									1,
									`flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-all ${t(S) ? 'font-semibold text-primary-600 dark:text-primary-400' : 'hover:bg-surface-100 hover:text-primary-500 focus:bg-surface-100 focus:text-primary-500 dark:hover:bg-surface-800 dark:focus:bg-surface-800'} focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1`
								),
									ye(dt, 'aria-current', t(S) ? 'page' : void 0),
									ye(dt, 'title', t(E)));
							}),
							h(Q, dt));
					};
				K(p, (Q) => {
					t(T) ? Q(G) : Q(L, !1);
				});
			}
			var U = r(p, 2);
			{
				var Y = (Q) => {
					var dt = si(),
						lt = i(dt);
					(l(lt, 'icon', 'mdi:chevron-right'), l(lt, 'width', '16'), a(dt), h(Q, dt));
				};
				K(U, (Q) => {
					t(S) || Q(Y);
				});
			}
			(a(M), h(k, M));
		}
	),
		a(g));
	var R = r(g, 2);
	R.__click = d;
	var N = i(R);
	(l(N, 'icon', 'mdi:content-copy'), l(N, 'width', '16'), a(R));
	var O = r(R, 2),
		w = i(O);
	(a(O), a(f), $((k) => at(w, `Current location: ${k ?? ''}`), [() => e.breadcrumb.join(', then ')]), h(D, f), ce());
}
Ee(['click', 'keydown']);
var ui = C('<iconify-icon></iconify-icon>', 2),
	fi = C('<iconify-icon></iconify-icon> <span>Generate</span>', 3),
	vi = C('<button class="btn btn-sm variant-filled-secondary"><!></button>'),
	hi = C('<input type="text" class="input input-sm w-24 px-1 py-0 text-xs"/>'),
	mi = C(
		'<button class="badge variant-filled-secondary flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-secondary-300"> <span role="button" tabindex="0" aria-label="Remove Tag"><iconify-icon></iconify-icon></span></button>',
		2
	),
	pi = C('<div class="text-xs opacity-60 italic">No pending tags.</div>'),
	gi = C(
		'<div class="mt-3 pt-3 border-t border-primary-500/20"><button class="btn btn-sm variant-filled-success w-full"><iconify-icon></iconify-icon> <span>Save All to Media Tags</span></button></div>',
		2
	),
	bi = C('<input type="text" class="input input-sm w-24 px-1 py-0 text-xs"/>'),
	yi = C(
		'<button class="badge variant-filled-surface flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-surface-400"> <span role="button" tabindex="0" aria-label="Remove Tag"><iconify-icon></iconify-icon></span></button>',
		2
	),
	_i = C('<div class="text-xs opacity-60 italic">No saved tags.</div>'),
	xi = C(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" tabindex="-1"><div class="card w-full max-w-lg p-4 bg-surface-100 dark:bg-surface-800 shadow-xl m-4" role="document"><header class="flex justify-between items-center mb-4"><h3 class="h3 font-bold">Manage Tags</h3> <button class="btn-icon btn-icon-sm" aria-label="Close Modal"><iconify-icon></iconify-icon></button></header> <div class="space-y-4 max-h-[60vh] overflow-y-auto p-1"><div class="flex items-center gap-3 p-2 bg-surface-200 dark:bg-surface-700 rounded"><img alt="Thumbnail" class="w-12 h-12 object-cover rounded bg-black"/> <div class="text-sm truncate"><div class="font-bold truncate"> </div> <div class="opacity-70 text-xs"> </div></div></div> <section class="p-3 border border-primary-500/30 rounded bg-primary-50/50 dark:bg-primary-900/10"><div class="flex justify-between items-center mb-2"><span class="text-sm font-bold flex items-center gap-1 text-primary-600 dark:text-primary-400"><iconify-icon></iconify-icon> AI / Pending Tags</span> <!></div> <div class="flex flex-wrap gap-2 mb-3"><!></div> <div class="flex gap-2"><input class="input input-sm flex-1" type="text" placeholder="Add tag manually..."/> <button class="btn btn-sm variant-filled-surface" aria-label="Add Tag"><iconify-icon></iconify-icon></button></div> <!></section> <section class="p-3 border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-900"><div class="mb-2 text-sm font-bold opacity-80">Saved Tags</div> <div class="flex flex-wrap gap-2"><!></div></section></div></div></div>',
		2
	);
function Na(D, e) {
	le(e, !0);
	let n = Tt(e, 'show', 15),
		s = Tt(e, 'file', 15, null),
		c = Tt(e, 'onUpdate', 3, () => {}),
		v = V(''),
		b = V(!1),
		u = V(!1),
		d = V(null);
	function _(S) {
		const T = S.thumbnails || {};
		return 'sm' in T ? T.sm.url : 'thumbnail' in T ? T.thumbnail.url : 'md' in T ? T.md.url : S.url;
	}
	async function f() {
		if (s()?._id) {
			o(b, !0);
			try {
				const S = await fetch(`/api/media/${s()._id}/tags`, { method: 'POST' }),
					T = await S.json();
				if (!S.ok || !T.success) throw new Error(T.error || 'Failed.');
				(s() && (s(T.data), c()(T.data)), se.success({ description: 'AI tags generated!' }));
			} catch (S) {
				se.error({ description: S.message });
			} finally {
				o(b, !1);
			}
		}
	}
	async function g() {
		if (!(!s()?._id || !t(v).trim()))
			try {
				const S = await fetch(`/api/media/${s()._id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ metadata: { ...s().metadata, aiTags: [...(s().metadata?.aiTags || []), t(v).trim()] } })
					}),
					T = await S.json();
				if (!S.ok || !T.success) throw new Error(T.error);
				(s() && (s(T.data), c()(T.data)), o(v, ''), se.success({ description: 'Tag added!' }));
			} catch (S) {
				se.error({ description: S.message });
			}
	}
	async function R(S, T) {
		if (s()?._id)
			try {
				const M = { ...s().metadata };
				T === 'ai' ? (M.aiTags = M.aiTags?.filter((L) => L !== S) || []) : (M.tags = M.tags?.filter((L) => L !== S) || []);
				const p = await fetch(`/api/media/${s()._id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ metadata: M })
					}),
					G = await p.json();
				if (!p.ok || !G.success) throw new Error(G.error);
				s() && (s(G.data), c()(G.data));
			} catch (M) {
				se.error({ description: M.message });
			}
	}
	async function N(S, T, M) {
		if (!s()?._id || !T.trim() || S === T) {
			o(d, null);
			return;
		}
		try {
			const p = { ...s().metadata };
			M === 'ai' ? (p.aiTags = p.aiTags?.map((U) => (U === S ? T.trim() : U)) || []) : (p.tags = p.tags?.map((U) => (U === S ? T.trim() : U)) || []);
			const G = await fetch(`/api/media/${s()._id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ metadata: p })
				}),
				L = await G.json();
			if (!G.ok || !L.success) throw new Error(L.error);
			s() && (s(L.data), c()(L.data));
		} catch (p) {
			se.error({ description: p.message });
		} finally {
			o(d, null);
		}
	}
	async function O() {
		if (s()?._id) {
			o(u, !0);
			try {
				const S = new Set(s().metadata?.tags || []);
				s().metadata?.aiTags?.forEach((p) => S.add(p));
				const T = await fetch(`/api/media/${s()._id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ metadata: { ...s().metadata, tags: Array.from(S), aiTags: [] } })
					}),
					M = await T.json();
				if (!T.ok || !M.success) throw new Error(M.error);
				(s() && (s(M.data), c()(M.data)), se.success({ description: 'Tags saved!' }));
			} catch (S) {
				se.error({ description: S.message });
			} finally {
				o(u, !1);
			}
		}
	}
	function w() {
		n(!1);
	}
	function k(S) {
		S.focus();
	}
	var E = Zt(),
		m = ct(E);
	{
		var z = (S) => {
			var T = xi();
			((T.__click = (Z) => {
				Z.target === Z.currentTarget && w();
			}),
				(T.__keydown = (Z) => Z.key === 'Escape' && w()));
			var M = i(T),
				p = i(M),
				G = r(i(p), 2);
			G.__click = w;
			var L = i(G);
			(l(L, 'icon', 'mdi:close'), l(L, 'width', '24'), a(G), a(p));
			var U = r(p, 2),
				Y = i(U),
				Q = i(Y),
				dt = r(Q, 2),
				lt = i(dt),
				X = i(lt, !0);
			a(lt);
			var P = r(lt, 2),
				H = i(P, !0);
			(a(P), a(dt), a(Y));
			var W = r(Y, 2),
				x = i(W),
				B = i(x),
				q = i(B);
			(l(q, 'icon', 'mdi:robot-excited-outline'), nt(), a(B));
			var rt = r(B, 2);
			{
				var kt = (Z) => {
					var st = vi();
					st.__click = f;
					var Qt = i(st);
					{
						var tt = (Rt) => {
								var St = ui();
								(l(St, 'icon', 'eos-icons:loading'), wt(St, 1, 'animate-spin'), h(Rt, St));
							},
							et = (Rt) => {
								var St = fi(),
									ut = ct(St);
								(l(ut, 'icon', 'mdi:magic-staff'), nt(2), h(Rt, St));
							};
						K(Qt, (Rt) => {
							t(b) ? Rt(tt) : Rt(et, !1);
						});
					}
					(a(st), $(() => (st.disabled = t(b))), h(Z, st));
				};
				K(rt, (Z) => {
					s().metadata?.aiTags?.length || Z(kt);
				});
			}
			a(x);
			var ft = r(x, 2),
				zt = i(ft);
			{
				var pt = (Z) => {
						var st = Zt(),
							Qt = ct(st);
						(Be(
							Qt,
							17,
							() => s().metadata.aiTags,
							Ke,
							(tt, et, Rt) => {
								var St = Zt(),
									ut = ct(St);
								{
									var Bt = (It) => {
											var gt = hi();
											(Kt(gt),
												(gt.__input = (Ut) => (t(d).value = Ut.currentTarget.value)),
												(gt.__keydown = (Ut) => {
													(Ut.key === 'Enter' && N(t(et), t(d).value, 'ai'), Ut.key === 'Escape' && o(d, null));
												}),
												_a(gt, (Ut) => k?.(Ut)),
												$(() => Ze(gt, t(d).value)),
												Ve('blur', gt, () => N(t(et), t(d).value, 'ai')),
												h(It, gt));
										},
										re = (It) => {
											var gt = mi();
											gt.__click = () => o(d, { type: 'ai', index: Rt, value: t(et) }, !0);
											var Ut = i(gt),
												Vt = r(Ut);
											((Vt.__click = (ae) => {
												(ae.stopPropagation(), R(t(et), 'ai'));
											}),
												(Vt.__keydown = (ae) => ae.key === 'Enter' && R(t(et), 'ai')));
											var $t = i(Vt);
											(l($t, 'icon', 'mdi:close'), l($t, 'width', '14'), a(Vt), a(gt), $(() => at(Ut, `${t(et) ?? ''} `)), h(It, gt));
										};
									K(ut, (It) => {
										t(d)?.type === 'ai' && t(d).index === Rt ? It(Bt) : It(re, !1);
									});
								}
								h(tt, St);
							}
						),
							h(Z, st));
					},
					Ft = (Z) => {
						var st = pi();
						h(Z, st);
					};
				K(zt, (Z) => {
					s().metadata?.aiTags?.length ? Z(pt) : Z(Ft, !1);
				});
			}
			a(ft);
			var J = r(ft, 2),
				vt = i(J);
			(Kt(vt), (vt.__keydown = (Z) => Z.key === 'Enter' && g()));
			var At = r(vt, 2);
			At.__click = g;
			var Ct = i(At);
			(l(Ct, 'icon', 'mdi:plus'), a(At), a(J));
			var Nt = r(J, 2);
			{
				var ve = (Z) => {
					var st = gi(),
						Qt = i(st);
					Qt.__click = O;
					var tt = i(Qt);
					(l(tt, 'icon', 'mdi:check-all'), nt(2), a(Qt), a(st), $(() => (Qt.disabled = t(u))), h(Z, st));
				};
				K(Nt, (Z) => {
					s().metadata?.aiTags?.length && Z(ve);
				});
			}
			a(W);
			var Ae = r(W, 2),
				we = r(i(Ae), 2),
				_e = i(we);
			{
				var Fe = (Z) => {
						var st = Zt(),
							Qt = ct(st);
						(Be(
							Qt,
							17,
							() => s().metadata.tags,
							Ke,
							(tt, et, Rt) => {
								var St = Zt(),
									ut = ct(St);
								{
									var Bt = (It) => {
											var gt = bi();
											(Kt(gt),
												(gt.__input = (Ut) => (t(d).value = Ut.currentTarget.value)),
												(gt.__keydown = (Ut) => {
													(Ut.key === 'Enter' && N(t(et), t(d).value, 'user'), Ut.key === 'Escape' && o(d, null));
												}),
												_a(gt, (Ut) => k?.(Ut)),
												$(() => Ze(gt, t(d).value)),
												Ve('blur', gt, () => N(t(et), t(d).value, 'user')),
												h(It, gt));
										},
										re = (It) => {
											var gt = yi();
											gt.__click = () => o(d, { type: 'user', index: Rt, value: t(et) }, !0);
											var Ut = i(gt),
												Vt = r(Ut);
											((Vt.__click = (ae) => {
												(ae.stopPropagation(), R(t(et), 'user'));
											}),
												(Vt.__keydown = (ae) => ae.key === 'Enter' && R(t(et), 'user')));
											var $t = i(Vt);
											(l($t, 'icon', 'mdi:close'), l($t, 'width', '14'), a(Vt), a(gt), $(() => at(Ut, `${t(et) ?? ''} `)), h(It, gt));
										};
									K(ut, (It) => {
										t(d)?.type === 'user' && t(d).index === Rt ? It(Bt) : It(re, !1);
									});
								}
								h(tt, St);
							}
						),
							h(Z, st));
					},
					ke = (Z) => {
						var st = _i();
						h(Z, st);
					};
				K(_e, (Z) => {
					s().metadata?.tags?.length ? Z(Fe) : Z(ke, !1);
				});
			}
			(a(we),
				a(Ae),
				a(U),
				a(M),
				a(T),
				$(
					(Z, st) => {
						(ye(Q, 'src', Z), at(X, s().filename), at(H, s().mimeType), (At.disabled = st));
					},
					[() => _(s()), () => !t(v).trim()]
				),
				Re(
					vt,
					() => t(v),
					(Z) => o(v, Z)
				),
				h(S, T));
		};
		K(m, (S) => {
			n() && s() && S(z);
		});
	}
	(h(D, E), ce());
}
Ee(['click', 'keydown', 'input']);
var wi = C(
		'<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500"><iconify-icon></iconify-icon> <p class="text-lg">No media found</p></div>',
		2
	),
	ki = C(
		'<button class="preset-outline-surface-500 btn-sm"><iconify-icon></iconify-icon> Select All</button> <button class="preset-outline-surface-500 btn-sm"><iconify-icon></iconify-icon> Deselect All</button>',
		3
	),
	Si = C(
		'<div class="flex items-center gap-2"><span class="text-sm"> </span> <button class="preset-filled-error-500 btn-sm"><iconify-icon></iconify-icon> Delete Selected</button></div>',
		2
	),
	Ti = C('<div class="absolute left-2 top-2 z-10"><input type="checkbox" class="checkbox" aria-label="Select file"/></div>'),
	Ci = C('<button aria-label="File Info" class="btn-icon" title="File Info"><iconify-icon></iconify-icon></button>', 2),
	Ri = C('<tr><td class="px-2 font-semibold">Original:</td><td class="px-2"> </td><td class="px-2"> </td></tr>'),
	Ai = C('<span class="ml-1 text-[10px] text-primary-500">(active)</span>'),
	Di = C('<tr><td class="px-2 font-bold text-tertiary-500"> <!></td><td class="px-2 text-right"><!></td><td class="px-2 text-right"><!></td></tr>'),
	Ii = C(
		'<table class="table-auto text-xs"><thead class="text-tertiary-500"><tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center"><th class="px-2 text-left">Format</th><th class="px-2">Pixel</th><th class="px-2">Size</th></tr></thead><tbody><!><!></tbody></table> <!>',
		1
	),
	Ei = C('<!> <!>', 1),
	Fi = C('<iconify-icon></iconify-icon>', 2),
	Pi = C('<iconify-icon></iconify-icon>', 2),
	zi = C('<button aria-label="Toggle Tags" class="btn-icon"><!></button>'),
	Mi = C('View/Edit Tags <!>', 1),
	Ni = C('<!> <!>', 1),
	ji = C('<button aria-label="Edit" class="btn-icon"><iconify-icon></iconify-icon></button>', 2),
	Gi = C('Edit Image <!>', 1),
	Ui = C('<!> <!>', 1),
	Oi = C('<!> <!>', 1),
	Li = C('<button aria-label="Delete" class="btn-icon"><iconify-icon></iconify-icon></button>', 2),
	Wi = C('Delete Image <!>', 1),
	Bi = C('<!> <!>', 1),
	Hi = C('<img loading="lazy" decoding="async"/>'),
	Xi = C(
		'<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img"><iconify-icon></iconify-icon></div>',
		2
	),
	Vi = C(
		'<div role="button" tabindex="0"><!> <header class="m-2 flex w-auto items-center justify-between"><!> <div class="flex items-center gap-1"><!> <!></div></header> <section class="flex items-center justify-center p-2"><!></section> <div class="label overflow-hidden text-ellipsis whitespace-nowrap p-1 text-center font-bold text-xs"> </div> <footer class="flex flex-col gap-2 p-1"><div class="flex grow items-center justify-between p-1 text-white"><div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden"><iconify-icon></iconify-icon> <span class="truncate text-[10px] uppercase"> </span></div> <p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 text-[10px]"><span> </span> KB</p></div></footer></div>',
		2
	),
	Yi = C(
		'<div class="mb-4 flex w-full items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700"><div class="flex items-center gap-2"><button class="preset-outline-surface-500 btn-sm" aria-label="Toggle selection mode"><iconify-icon></iconify-icon> </button> <!></div> <!></div> <!>',
		3
	),
	Ji = C('<div class="flex flex-wrap items-center gap-4 overflow-auto"><!></div> <!>', 1);
function qi(D, e) {
	le(e, !0);
	const n = Tt(e, 'filteredFiles', 27, () => Me([])),
		s = Tt(e, 'gridSize', 3, 'medium'),
		c = Tt(e, 'ondeleteImage', 3, () => {}),
		v = Tt(e, 'onBulkDelete', 3, () => {}),
		b = Tt(e, 'onEditImage', 3, () => {}),
		u = Tt(e, 'onsizechange', 3, () => {}),
		d = Tt(e, 'onUpdateImage', 3, () => {});
	let _ = V(Me([])),
		f = V(Me(new Set())),
		g = V(!1),
		R = V(!1),
		N = V(null);
	function O(X) {
		(o(N, X, !0), o(R, !0));
	}
	function w(X) {
		if (!X) return 'Unknown';
		const P = X.split('/');
		return P[1] ? P[1].toUpperCase() : P[0].toUpperCase();
	}
	function k(X) {
		const P = X.filename || '',
			H = P.substring(P.lastIndexOf('.')).toLowerCase();
		switch (!0) {
			case X.type === 'image':
				return 'fa-solid:image';
			case X.type === 'video':
				return 'fa-solid:video';
			case X.type === 'audio':
				return 'fa-solid:play-circle';
			case H === '.pdf':
				return 'vscode-icons:file-type-pdf2';
			case H === '.doc' || H === '.docx' || H === '.docm':
				return 'vscode-icons:file-type-word';
			case H === '.ppt' || H === '.pptx':
				return 'vscode-icons:file-type-powerpoint';
			case H === '.xls' || H === '.xlsx':
				return 'vscode-icons:file-type-excel';
			case H === '.txt':
				return 'fa-solid:file-lines';
			case H === '.zip' || H === '.rar':
				return 'fa-solid:file-zipper';
			default:
				return 'vscode-icons:file';
		}
	}
	function E(X) {
		c()(X);
	}
	function m(X) {
		const P = X._id?.toString() || X.filename;
		(t(f).has(P) ? t(f).delete(P) : t(f).add(P), o(f, t(f), !0));
	}
	function z() {
		o(f, new Set(n().map((X) => X._id?.toString() || X.filename)), !0);
	}
	function S() {
		o(f, new Set(), !0);
	}
	function T() {
		const X = n().filter((P) => t(f).has(P._id?.toString() || P.filename));
		X.length > 0 && (v()(X), o(f, new Set(), !0), o(g, !1));
	}
	je(() => {
		o(
			_,
			Array.from({ length: n().length }, () => !1),
			!0
		);
	});
	function M(X) {
		return 'thumbnails' in X ? X.thumbnails || {} : {};
	}
	function p(X, P) {
		const H = M(X),
			x = { tiny: 'thumbnail', small: 'sm', medium: 'md', large: 'lg' }[P] || P;
		return H ? H[x] : void 0;
	}
	function G(X, P) {
		return p(X, P)?.url || X.url;
	}
	var L = Ji(),
		U = ct(L),
		Y = i(U);
	{
		var Q = (X) => {
				var P = wi(),
					H = i(P);
				(l(H, 'icon', 'bi:exclamation-circle-fill'), l(H, 'height', '44'), wt(H, 1, 'mb-2'), nt(2), a(P), h(X, P));
			},
			dt = (X) => {
				var P = Yi(),
					H = ct(P),
					W = i(H),
					x = i(W);
				x.__click = () => {
					(o(g, !t(g)), o(f, new Set(), !0));
				};
				var B = i(x);
				($(() => l(B, 'icon', t(g) ? 'mdi:close' : 'mdi:checkbox-multiple-marked')), l(B, 'width', '20'));
				var q = r(B);
				a(x);
				var rt = r(x, 2);
				{
					var kt = (Ft) => {
						var J = ki(),
							vt = ct(J);
						vt.__click = z;
						var At = i(vt);
						(l(At, 'icon', 'mdi:select-all'), l(At, 'width', '20'), nt(), a(vt));
						var Ct = r(vt, 2);
						Ct.__click = S;
						var Nt = i(Ct);
						(l(Nt, 'icon', 'mdi:select-off'), l(Nt, 'width', '20'), nt(), a(Ct), h(Ft, J));
					};
					K(rt, (Ft) => {
						t(g) && Ft(kt);
					});
				}
				a(W);
				var ft = r(W, 2);
				{
					var zt = (Ft) => {
						var J = Si(),
							vt = i(J),
							At = i(vt);
						a(vt);
						var Ct = r(vt, 2);
						Ct.__click = T;
						var Nt = i(Ct);
						(l(Nt, 'icon', 'mdi:delete'), l(Nt, 'width', '20'), nt(), a(Ct), a(J), $(() => at(At, `${t(f).size ?? ''} selected`)), h(Ft, J));
					};
					K(ft, (Ft) => {
						t(f).size > 0 && Ft(zt);
					});
				}
				a(H);
				var pt = r(H, 2);
				(Be(
					pt,
					19,
					n,
					(Ft) => Ft._id?.toString() || Ft.filename,
					(Ft, J, vt) => {
						const At = Pt(() => t(J)._id?.toString() || t(J).filename),
							Ct = Pt(() => t(f).has(t(At)));
						var Nt = Vi();
						((Nt.__click = () => t(g) && m(t(J))),
							(Nt.__keydown = (Ot) => {
								t(g) && (Ot.key === 'Enter' || Ot.key === ' ') && (Ot.preventDefault(), m(t(J)));
							}));
						var ve = i(Nt);
						{
							var Ae = (Ot) => {
								var Lt = Ti(),
									_t = i(Lt);
								(Kt(_t), (_t.__change = () => m(t(J))), a(Lt), $(() => Pa(_t, t(Ct))), h(Ot, Lt));
							};
							K(ve, (Ot) => {
								t(g) && Ot(Ae);
							});
						}
						var we = r(ve, 2),
							_e = i(we);
						fe(_e, {
							positioning: { placement: 'right' },
							children: (Ot, Lt) => {
								var _t = Ei(),
									te = ct(_t);
								be(
									te,
									() => fe.Trigger,
									(Se, de) => {
										de(Se, {
											children: (Wt, ne) => {
												var yt = Ci(),
													bt = i(yt);
												(l(bt, 'icon', 'raphael:info'), l(bt, 'width', '24'), wt(bt, 1, 'text-tertiary-500 dark:text-primary-500'), a(yt), h(Wt, yt));
											},
											$$slots: { default: !0 }
										});
									}
								);
								var De = r(te, 2);
								(ea(De, {
									children: (Se, de) => {
										var Wt = Zt(),
											ne = ct(Wt);
										(be(
											ne,
											() => fe.Positioner,
											(yt, bt) => {
												bt(yt, {
													children: (jt, ue) => {
														var Xt = Zt(),
															mt = ct(Xt);
														(be(
															mt,
															() => fe.Content,
															(Dt, Gt) => {
																Gt(Dt, {
																	class: 'rounded-container-token z-50 border border-surface-500 bg-surface-50 p-2 shadow-xl dark:bg-surface-900',
																	children: (j, ht) => {
																		var Et = Ii(),
																			xt = ct(Et),
																			Jt = r(i(xt)),
																			ee = i(Jt);
																		{
																			var pe = (he) => {
																				var oe = Ri(),
																					Ie = r(i(oe)),
																					Oe = i(Ie);
																				a(Ie);
																				var Le = r(Ie),
																					He = i(Le, !0);
																				(a(Le),
																					a(oe),
																					$(
																						(ze) => {
																							(at(Oe, `${t(J).width ?? ''}x${t(J).height ?? ''}`), at(He, ze));
																						},
																						[() => ta(t(J).size)]
																					),
																					h(he, oe));
																			};
																			K(ee, (he) => {
																				'width' in t(J) && t(J).width && 'height' in t(J) && t(J).height && he(pe);
																			});
																		}
																		var Te = r(ee);
																		(Be(
																			Te,
																			16,
																			() => Object.keys(M(t(J))),
																			(he) => he,
																			(he, oe) => {
																				const Ie = Pt(() => p(t(J), oe));
																				var Oe = Zt(),
																					Le = ct(Oe);
																				{
																					var He = (ze) => {
																						var Ue = Di();
																						Ue.__click = (Ht) => {
																							(Ht.preventDefault(),
																								(oe === 'tiny' || oe === 'small' || oe === 'medium' || oe === 'large') &&
																									u()({
																										size: oe === 'tiny' ? 'small' : oe === 'small' ? 'medium' : oe === 'medium' ? 'large' : 'tiny',
																										type: 'grid'
																									}));
																						};
																						var Je = i(Ue),
																							Qe = i(Je),
																							da = r(Qe);
																						{
																							var ua = (Ht) => {
																								var xe = Ai();
																								h(Ht, xe);
																							};
																							K(da, (Ht) => {
																								oe === s() && Ht(ua);
																							});
																						}
																						a(Je);
																						var I = r(Je),
																							F = i(I);
																						{
																							var A = (Ht) => {
																									var xe = qe();
																									($(() => at(xe, `${t(Ie).width ?? ''}x${t(Ie).height ?? ''}`)), h(Ht, xe));
																								},
																								ot = (Ht) => {
																									var xe = qe('N/A');
																									h(Ht, xe);
																								};
																							K(F, (Ht) => {
																								t(Ie).width && t(Ie).height ? Ht(A) : Ht(ot, !1);
																							});
																						}
																						a(I);
																						var Mt = r(I),
																							Yt = i(Mt);
																						{
																							var ie = (Ht) => {
																									var xe = qe();
																									($((Ce) => at(xe, Ce), [() => ta(t(Ie).size)]), h(Ht, xe));
																								},
																								ge = (Ht) => {
																									var xe = Zt(),
																										Ce = ct(xe);
																									{
																										var me = (We) => {
																												var ia = qe();
																												($((Ua) => at(ia, Ua), [() => ta(t(J).size)]), h(We, ia));
																											},
																											Ne = (We) => {
																												var ia = qe('N/A');
																												h(We, ia);
																											};
																										K(
																											Ce,
																											(We) => {
																												oe === 'original' && t(J).size ? We(me) : We(Ne, !1);
																											},
																											!0
																										);
																									}
																									h(Ht, xe);
																								};
																							K(Yt, (Ht) => {
																								t(Ie).size ? Ht(ie) : Ht(ge, !1);
																							});
																						}
																						(a(Mt),
																							a(Ue),
																							$(() => {
																								(wt(
																									Ue,
																									1,
																									`divide-x divide-surface-400 border-b border-surface-400 last:border-b-0 ${oe === s() ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`
																								),
																									at(Qe, `${oe ?? ''} `));
																							}),
																							h(ze, Ue));
																					};
																					K(Le, (ze) => {
																						t(Ie) && ze(He);
																					});
																				}
																				h(he, Oe);
																			}
																		),
																			a(Jt),
																			a(xt));
																		var Ge = r(xt, 2);
																		(be(
																			Ge,
																			() => fe.Arrow,
																			(he, oe) => {
																				oe(he, { class: 'fill-surface-50 dark:fill-surface-900' });
																			}
																		),
																			h(j, Et));
																	},
																	$$slots: { default: !0 }
																});
															}
														),
															h(jt, Xt));
													},
													$$slots: { default: !0 }
												});
											}
										),
											h(Se, Wt));
									},
									$$slots: { default: !0 }
								}),
									h(Ot, _t));
							},
							$$slots: { default: !0 }
						});
						var Fe = r(_e, 2),
							ke = i(Fe);
						{
							var Z = (Ot) => {
								var Lt = Oi(),
									_t = ct(Lt);
								fe(_t, {
									positioning: { placement: 'top' },
									children: (De, Se) => {
										var de = Ni(),
											Wt = ct(de);
										be(
											Wt,
											() => fe.Trigger,
											(yt, bt) => {
												bt(yt, {
													children: (jt, ue) => {
														var Xt = zi();
														Xt.__click = () => O(t(J));
														var mt = i(Xt);
														{
															var Dt = (j) => {
																	var ht = Fi();
																	(l(ht, 'icon', 'mdi:tag-multiple'), l(ht, 'width', '22'), wt(ht, 1, 'text-primary-500'), h(j, ht));
																},
																Gt = (j) => {
																	var ht = Pi();
																	(l(ht, 'icon', 'mdi:tag-outline'), l(ht, 'width', '22'), wt(ht, 1, 'text-surface-500'), h(j, ht));
																};
															K(mt, (j) => {
																t(J).metadata?.aiTags?.length || t(J).metadata?.tags?.length ? j(Dt) : j(Gt, !1);
															});
														}
														(a(Xt), h(jt, Xt));
													},
													$$slots: { default: !0 }
												});
											}
										);
										var ne = r(Wt, 2);
										(ea(ne, {
											children: (yt, bt) => {
												var jt = Zt(),
													ue = ct(jt);
												(be(
													ue,
													() => fe.Positioner,
													(Xt, mt) => {
														mt(Xt, {
															children: (Dt, Gt) => {
																var j = Zt(),
																	ht = ct(j);
																(be(
																	ht,
																	() => fe.Content,
																	(Et, xt) => {
																		xt(Et, {
																			class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
																			children: (Jt, ee) => {
																				nt();
																				var pe = Mi(),
																					Te = r(ct(pe));
																				(be(
																					Te,
																					() => fe.Arrow,
																					(Ge, he) => {
																						he(Ge, { class: 'fill-surface-900 dark:fill-surface-100' });
																					}
																				),
																					h(Jt, pe));
																			},
																			$$slots: { default: !0 }
																		});
																	}
																),
																	h(Dt, j));
															},
															$$slots: { default: !0 }
														});
													}
												),
													h(yt, jt));
											},
											$$slots: { default: !0 }
										}),
											h(De, de));
									},
									$$slots: { default: !0 }
								});
								var te = r(_t, 2);
								(fe(te, {
									positioning: { placement: 'top' },
									children: (De, Se) => {
										var de = Ui(),
											Wt = ct(de);
										be(
											Wt,
											() => fe.Trigger,
											(yt, bt) => {
												bt(yt, {
													children: (jt, ue) => {
														var Xt = ji();
														Xt.__click = () => b()(t(J));
														var mt = i(Xt);
														(l(mt, 'icon', 'mdi:pen'), l(mt, 'width', '24'), wt(mt, 1, 'text-primary-500'), a(Xt), h(jt, Xt));
													},
													$$slots: { default: !0 }
												});
											}
										);
										var ne = r(Wt, 2);
										(ea(ne, {
											children: (yt, bt) => {
												var jt = Zt(),
													ue = ct(jt);
												(be(
													ue,
													() => fe.Positioner,
													(Xt, mt) => {
														mt(Xt, {
															children: (Dt, Gt) => {
																var j = Zt(),
																	ht = ct(j);
																(be(
																	ht,
																	() => fe.Content,
																	(Et, xt) => {
																		xt(Et, {
																			class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
																			children: (Jt, ee) => {
																				nt();
																				var pe = Gi(),
																					Te = r(ct(pe));
																				(be(
																					Te,
																					() => fe.Arrow,
																					(Ge, he) => {
																						he(Ge, { class: 'fill-surface-900 dark:fill-surface-100' });
																					}
																				),
																					h(Jt, pe));
																			},
																			$$slots: { default: !0 }
																		});
																	}
																),
																	h(Dt, j));
															},
															$$slots: { default: !0 }
														});
													}
												),
													h(yt, jt));
											},
											$$slots: { default: !0 }
										}),
											h(De, de));
									},
									$$slots: { default: !0 }
								}),
									h(Ot, Lt));
							};
							K(ke, (Ot) => {
								t(J).type === 'image' && Ot(Z);
							});
						}
						var st = r(ke, 2);
						(fe(st, {
							positioning: { placement: 'top' },
							children: (Ot, Lt) => {
								var _t = Bi(),
									te = ct(_t);
								be(
									te,
									() => fe.Trigger,
									(Se, de) => {
										de(Se, {
											children: (Wt, ne) => {
												var yt = Li();
												yt.__click = () => E(t(J));
												var bt = i(yt);
												(l(bt, 'icon', 'icomoon-free:bin'), l(bt, 'width', '24'), wt(bt, 1, 'text-error-500'), a(yt), h(Wt, yt));
											},
											$$slots: { default: !0 }
										});
									}
								);
								var De = r(te, 2);
								(ea(De, {
									children: (Se, de) => {
										var Wt = Zt(),
											ne = ct(Wt);
										(be(
											ne,
											() => fe.Positioner,
											(yt, bt) => {
												bt(yt, {
													children: (jt, ue) => {
														var Xt = Zt(),
															mt = ct(Xt);
														(be(
															mt,
															() => fe.Content,
															(Dt, Gt) => {
																Gt(Dt, {
																	class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
																	children: (j, ht) => {
																		nt();
																		var Et = Wi(),
																			xt = r(ct(Et));
																		(be(
																			xt,
																			() => fe.Arrow,
																			(Jt, ee) => {
																				ee(Jt, { class: 'fill-surface-900 dark:fill-surface-100' });
																			}
																		),
																			h(j, Et));
																	},
																	$$slots: { default: !0 }
																});
															}
														),
															h(jt, Xt));
													},
													$$slots: { default: !0 }
												});
											}
										),
											h(Se, Wt));
									},
									$$slots: { default: !0 }
								}),
									h(Ot, _t));
							},
							$$slots: { default: !0 }
						}),
							a(Fe),
							a(we));
						var Qt = r(we, 2),
							tt = i(Qt);
						{
							var et = (Ot) => {
									var Lt = Hi();
									($(
										(_t) => {
											(ye(Lt, 'src', _t),
												ye(Lt, 'alt', `Thumbnail for ${t(J).filename}`),
												wt(
													Lt,
													1,
													`rounded object-cover ${s() === 'tiny' ? 'h-16 w-16' : s() === 'small' ? 'h-24 w-24' : s() === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`,
													'svelte-1gtiqps'
												));
										},
										[() => G(t(J), s()) ?? '/static/Default_User.svg']
									),
										Ve('error', Lt, (_t) => {
											const te = _t.target;
											te &&
												(qt.error('Failed to load media thumbnail for file:', t(J).filename),
												(te.src = '/static/Default_User.svg'),
												(te.alt = 'Fallback thumbnail image'));
										}),
										ma(Lt),
										h(Ot, Lt));
								},
								Rt = (Ot) => {
									var Lt = Xi(),
										_t = i(Lt);
									(l(_t, 'icon', 'bi:exclamation-triangle-fill'),
										l(_t, 'height', '24'),
										wt(_t, 1, 'text-warning-500'),
										l(_t, 'aria-hidden', 'true'),
										a(Lt),
										h(Ot, Lt));
								};
							K(tt, (Ot) => {
								t(J)?.filename && t(J)?.path && t(J)?.hash ? Ot(et) : Ot(Rt, !1);
							});
						}
						a(Qt);
						var St = r(Qt, 2),
							ut = i(St, !0);
						a(St);
						var Bt = r(St, 2),
							re = i(Bt),
							It = i(re),
							gt = i(It);
						($(() => l(gt, 'icon', k(t(J)))), l(gt, 'width', '12'), l(gt, 'height', '12'));
						var Ut = r(gt, 2),
							Vt = i(Ut, !0);
						(a(Ut), a(It));
						var $t = r(It, 2),
							ae = i($t),
							Pe = i(ae, !0);
						(a(ae),
							nt(),
							a($t),
							a(re),
							a(Bt),
							a(Nt),
							$(
								(Ot, Lt) => {
									(wt(
										Nt,
										1,
										`card relative border border-surface-300 dark:border-surface-500 ${t(Ct) ? 'ring-2 ring-primary-500' : ''}`,
										'svelte-1gtiqps'
									),
										ye(St, 'title', t(J).filename),
										at(ut, t(J).filename),
										ye(It, 'title', t(J).type),
										at(Vt, Ot),
										at(Pe, Lt));
								},
								[() => w(t(J).mimeType), () => (t(J).size / 1024).toFixed(2)]
							),
							Ve('mouseenter', Nt, () => (t(_)[t(vt)] = !0)),
							Ve('mouseleave', Nt, () => (t(_)[t(vt)] = !1)),
							la(
								1,
								Nt,
								() => ba,
								() => ({ duration: 300, start: 0.9, opacity: 0, easing: ya })
							),
							la(
								2,
								Nt,
								() => ba,
								() => ({ duration: 250, start: 0.95, opacity: 0, easing: ya })
							),
							h(Ft, Nt));
					}
				),
					$(() => at(q, ` ${t(g) ? 'Cancel' : 'Select'}`)),
					h(X, P));
			};
		K(Y, (X) => {
			n().length === 0 ? X(Q) : X(dt, !1);
		});
	}
	a(U);
	var lt = r(U, 2);
	(Na(lt, {
		get onUpdate() {
			return d();
		},
		get show() {
			return t(R);
		},
		set show(X) {
			o(R, X, !0);
		},
		get file() {
			return t(N);
		},
		set file(X) {
			o(N, X, !0);
		}
	}),
		h(D, L),
		ce());
}
Ee(['click', 'keydown', 'change']);
var Ki = C(
		'<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500"><iconify-icon></iconify-icon> <p class="text-lg">No media found</p></div>',
		2
	),
	Zi = C('<button class="variant-filled-error btn btn-sm ml-4"><iconify-icon></iconify-icon> <span> </span></button>', 2),
	Qi = C('<img loading="lazy" decoding="async"/>'),
	$i = C(
		'<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img"><iconify-icon></iconify-icon></div>',
		2
	),
	tn = C('<span class="badge variant-filled-surface text-[10px]"> </span>'),
	en = C('<span class="badge variant-filled-secondary text-[10px]"> </span>'),
	an = C('<span class="badge variant-soft text-[10px]"> </span>'),
	nn = C('<!> <!>', 1),
	rn = C('<button class="btn-icon btn-icon-sm variant-soft-primary" aria-label="Manage Tags"><iconify-icon></iconify-icon></button>', 2),
	on = C('Manage Tags <!>', 1),
	sn = C('<!> <!>', 1),
	ln = C(
		'<tr class="divide-x divide-surface-400 border-b border-black dark:border-white"><!><td><!></td><td> </td><td><!></td><td> </td><td> </td><td><div class="flex flex-wrap gap-1"><!> <!></div></td><td><button class="preset-outlined-primary-500 btn-sm" aria-label="Edit">Edit</button> <button class="preset-filled-error-500 btn-sm" aria-label="Delete">Delete</button></td></tr>'
	),
	cn = C(
		'<div class="mb-4 flex items-center justify-between"><div class="flex items-center gap-2"><h2 class="text-lg font-bold">Media Files</h2> <!></div> <div class="flex items-center gap-2"><!></div></div> <div class="table-container max-h-[calc(100vh-120px)] overflow-auto"><table class="table table-interactive table-hover"><thead class="bg-surface-100-800-token sticky top-0 text-tertiary-500 dark:text-primary-500"><tr class="divide-x divide-surface-400 border-b border-black dark:border-white text-tertiary-500 dark:text-primary-500"><th class="w-10">Select</th><th>Thumbnail</th><th> </th><th> </th><th> </th><th>Path</th><th>Tags</th><th>Actions</th></tr></thead><tbody></tbody></table> <div class=" bg-surface-100-800-token sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 py-2 md:flex-row md:justify-between md:p-4"><!></div></div>',
		1
	),
	dn = C('<div class="block w-full overflow-hidden"><!> <!></div>');
function un(D, e) {
	le(e, !0);
	let n = Tt(e, 'filteredFiles', 31, () => Me([])),
		s = Tt(e, 'tableSize', 3, 'medium'),
		c = Tt(e, 'ondeleteImage', 3, () => {}),
		v = Tt(e, 'onSelectionChange', 3, () => {}),
		b = Tt(e, 'onUpdateImage', 3, () => {}),
		u = Tt(e, 'onEditImage', 3, () => {}),
		d = Tt(e, 'onDeleteFiles', 3, () => {}),
		_ = V(''),
		f = V(!1),
		g = V(!1),
		R = V('normal');
	const N = Me(new Set());
	let O = V(!1),
		w = V(null);
	function k(W) {
		(o(w, W, !0), o(O, !0));
	}
	function E(W, x) {
		(x ? N.add(W.filename) : N.delete(W.filename), v()(n().filter((B) => N.has(B.filename))));
	}
	let m = V(1),
		z = V(10);
	const S = Pt(() => Math.ceil(n().length / t(z))),
		T = Pt(() => n().slice((t(m) - 1) * t(z), t(m) * t(z)));
	function M(W) {
		c()(W);
	}
	let p = V('name'),
		G = V(1);
	function L(W) {
		(t(p) === W ? o(G, t(G) * -1) : (o(p, W, !0), o(G, 1)),
			n(n().sort((x, B) => (W === 'size' ? ((x[W] ?? 0) - (B[W] ?? 0)) * t(G) : String(x[W]).localeCompare(String(B[W])) * t(G)))));
	}
	function U(W) {
		return 'thumbnails' in W ? W.thumbnails || {} : {};
	}
	function Y(W, x) {
		const B = U(W),
			rt = { tiny: 'thumbnail', small: 'sm', medium: 'md', large: 'lg' }[x] || x;
		return B ? B[rt] : void 0;
	}
	function Q(W, x) {
		return Y(W, x)?.url || W.url;
	}
	var dt = dn(),
		lt = i(dt);
	{
		var X = (W) => {
				var x = Ki(),
					B = i(x);
				(l(B, 'icon', 'bi:exclamation-circle-fill'), l(B, 'height', '44'), wt(B, 1, 'mb-2'), nt(2), a(x), h(W, x));
			},
			P = (W) => {
				var x = cn(),
					B = ct(x),
					q = i(B),
					rt = r(i(q), 2);
				{
					var kt = (Z) => {
						var st = Zi();
						st.__click = () => {
							const Rt = n().filter((St) => N.has(St.filename));
							(d()(Rt), N.clear());
						};
						var Qt = i(st);
						l(Qt, 'icon', 'mdi:trash-can-outline');
						var tt = r(Qt, 2),
							et = i(tt);
						(a(tt), a(st), $(() => at(et, `Delete (${N.size ?? ''})`)), h(Z, st));
					};
					K(rt, (Z) => {
						N.size > 0 && Z(kt);
					});
				}
				a(q);
				var ft = r(q, 2),
					zt = i(ft);
				(qa(zt, {
					get globalSearchValue() {
						return t(_);
					},
					set globalSearchValue(Z) {
						o(_, Z, !0);
					},
					get filterShow() {
						return t(f);
					},
					set filterShow(Z) {
						o(f, Z, !0);
					},
					get columnShow() {
						return t(g);
					},
					set columnShow(Z) {
						o(g, Z, !0);
					},
					get density() {
						return t(R);
					},
					set density(Z) {
						o(R, Z, !0);
					}
				}),
					a(ft),
					a(B));
				var pt = r(B, 2),
					Ft = i(pt),
					J = i(Ft),
					vt = i(J),
					At = r(i(vt), 2);
				At.__click = () => L('filename');
				var Ct = i(At);
				a(At);
				var Nt = r(At);
				Nt.__click = () => L('size');
				var ve = i(Nt);
				a(Nt);
				var Ae = r(Nt);
				Ae.__click = () => L('type');
				var we = i(Ae);
				(a(Ae), nt(3), a(vt), a(J));
				var _e = r(J);
				(Be(
					_e,
					21,
					() => t(T),
					(Z) => Z._id,
					(Z, st) => {
						var Qt = ln(),
							tt = i(Qt);
						{
							let yt = Pt(() => N.has(t(st).filename));
							Ka(tt, {
								cellClass: 'w-10 text-center',
								get checked() {
									return t(yt);
								},
								onCheck: (bt) => E(t(st), bt)
							});
						}
						var et = r(tt),
							Rt = i(et);
						{
							var St = (yt) => {
									var bt = Qi();
									($(
										(jt) => {
											(ye(bt, 'src', jt),
												ye(bt, 'alt', `Thumbnail for ${t(st).filename}`),
												wt(
													bt,
													1,
													`object-cover ${s() === 'tiny' ? 'h-10 w-10' : s() === 'small' ? 'h-16 w-16' : s() === 'medium' ? 'h-24 w-24' : 'h-32 w-32'}`
												));
										},
										[() => Q(t(st), s()) ?? '/Default_User.svg']
									),
										Ve('error', bt, (jt) => {
											const ue = jt.target;
											ue &&
												(qt.error('Failed to load media thumbnail for file:', t(st).filename),
												(ue.src = '/Default_User.svg'),
												(ue.alt = 'Fallback thumbnail image'));
										}),
										ma(bt),
										h(yt, bt));
								},
								ut = (yt) => {
									var bt = $i(),
										jt = i(bt);
									(l(jt, 'icon', 'bi:exclamation-triangle-fill'),
										l(jt, 'height', '24'),
										wt(jt, 1, 'text-warning-500'),
										l(jt, 'aria-hidden', 'true'),
										a(bt),
										h(yt, bt));
								};
							K(Rt, (yt) => {
								t(st)?.filename && t(st)?.path && t(st)?.hash ? yt(St) : yt(ut, !1);
							});
						}
						a(et);
						var Bt = r(et),
							re = i(Bt, !0);
						a(Bt);
						var It = r(Bt),
							gt = i(It);
						{
							var Ut = (yt) => {
									var bt = qe();
									($((jt) => at(bt, jt), [() => ta(t(st).size)]), h(yt, bt));
								},
								Vt = (yt) => {
									var bt = qe('Size unknown');
									h(yt, bt);
								};
							K(gt, (yt) => {
								t(st).size ? yt(Ut) : yt(Vt, !1);
							});
						}
						a(It);
						var $t = r(It),
							ae = i($t, !0);
						a($t);
						var Pe = r($t),
							Ot = i(Pe, !0);
						a(Pe);
						var Lt = r(Pe),
							_t = i(Lt),
							te = i(_t);
						{
							var De = (yt) => {
								const bt = Pt(() => t(st).metadata.tags || []),
									jt = Pt(() => t(st).metadata.aiTags || []),
									ue = Pt(() => t(bt).length + t(jt).length);
								var Xt = nn(),
									mt = ct(Xt);
								{
									var Dt = (Et) => {
											var xt = tn(),
												Jt = i(xt, !0);
											(a(xt), $(() => at(Jt, t(bt)[0])), h(Et, xt));
										},
										Gt = (Et) => {
											var xt = Zt(),
												Jt = ct(xt);
											{
												var ee = (pe) => {
													var Te = en(),
														Ge = i(Te, !0);
													(a(Te), $(() => at(Ge, t(jt)[0])), h(pe, Te));
												};
												K(
													Jt,
													(pe) => {
														t(jt).length > 0 && pe(ee);
													},
													!0
												);
											}
											h(Et, xt);
										};
									K(mt, (Et) => {
										t(bt).length > 0 ? Et(Dt) : Et(Gt, !1);
									});
								}
								var j = r(mt, 2);
								{
									var ht = (Et) => {
										var xt = an(),
											Jt = i(xt);
										(a(xt), $(() => at(Jt, `+${t(ue) - 1}`)), h(Et, xt));
									};
									K(j, (Et) => {
										t(ue) > 1 && Et(ht);
									});
								}
								h(yt, Xt);
							};
							K(te, (yt) => {
								'metadata' in t(st) && (t(st).metadata?.tags?.length || t(st).metadata?.aiTags?.length) && yt(De);
							});
						}
						var Se = r(te, 2);
						(fe(Se, {
							positioning: { placement: 'top' },
							children: (yt, bt) => {
								var jt = sn(),
									ue = ct(jt);
								be(
									ue,
									() => fe.Trigger,
									(mt, Dt) => {
										Dt(mt, {
											children: (Gt, j) => {
												var ht = rn();
												ht.__click = () => k(t(st));
												var Et = i(ht);
												(l(Et, 'icon', 'mdi:tag-edit'), a(ht), h(Gt, ht));
											},
											$$slots: { default: !0 }
										});
									}
								);
								var Xt = r(ue, 2);
								(ea(Xt, {
									children: (mt, Dt) => {
										var Gt = Zt(),
											j = ct(Gt);
										(be(
											j,
											() => fe.Positioner,
											(ht, Et) => {
												Et(ht, {
													children: (xt, Jt) => {
														var ee = Zt(),
															pe = ct(ee);
														(be(
															pe,
															() => fe.Content,
															(Te, Ge) => {
																Ge(Te, {
																	class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
																	children: (he, oe) => {
																		nt();
																		var Ie = on(),
																			Oe = r(ct(Ie));
																		(be(
																			Oe,
																			() => fe.Arrow,
																			(Le, He) => {
																				He(Le, { class: 'fill-surface-900 dark:fill-surface-100' });
																			}
																		),
																			h(he, Ie));
																	},
																	$$slots: { default: !0 }
																});
															}
														),
															h(xt, ee));
													},
													$$slots: { default: !0 }
												});
											}
										),
											h(mt, Gt));
									},
									$$slots: { default: !0 }
								}),
									h(yt, jt));
							},
							$$slots: { default: !0 }
						}),
							a(_t),
							a(Lt));
						var de = r(Lt),
							Wt = i(de);
						Wt.__click = () => u()(t(st));
						var ne = r(Wt, 2);
						((ne.__click = () => M(t(st))),
							a(de),
							a(Qt),
							$(() => {
								(ye(Bt, 'title', t(st).filename), at(re, t(st).filename), at(ae, t(st).type || 'Unknown'), at(Ot, t(st).path));
							}),
							h(Z, Qt));
					}
				),
					a(_e),
					a(Ft));
				var Fe = r(Ft, 2),
					ke = i(Fe);
				(Za(ke, {
					get pagesCount() {
						return t(S);
					},
					get totalItems() {
						return n().length;
					},
					rowsPerPageOptions: [5, 10, 25, 50, 100],
					onUpdatePage: (Z) => {
						o(m, Z, !0);
					},
					onUpdateRowsPerPage: (Z) => {
						(o(z, Z, !0), o(m, 1));
					},
					get currentPage() {
						return t(m);
					},
					set currentPage(Z) {
						o(m, Z, !0);
					},
					get rowsPerPage() {
						return t(z);
					},
					set rowsPerPage(Z) {
						o(z, Z, !0);
					}
				}),
					a(Fe),
					a(pt),
					$(() => {
						(at(Ct, `Name ${t(p) === 'filename' ? (t(G) === 1 ? '▲' : '▼') : ''}`),
							at(ve, `Size ${t(p) === 'size' ? (t(G) === 1 ? '▲' : '▼') : ''}`),
							at(we, `Type ${t(p) === 'type' ? (t(G) === 1 ? '▲' : '▼') : ''}`));
					}),
					h(W, x));
			};
		K(lt, (W) => {
			n().length === 0 ? W(X) : W(P, !1);
		});
	}
	var H = r(lt, 2);
	(Na(H, {
		get onUpdate() {
			return b();
		},
		get show() {
			return t(O);
		},
		set show(W) {
			o(O, W, !0);
		},
		get file() {
			return t(w);
		},
		set file(W) {
			o(w, W, !0);
		}
	}),
		a(dt),
		h(D, dt),
		ce());
}
Ee(['click']);
var fn = C(
		'<button class="preset-outline-surface-500 btn-sm"><iconify-icon></iconify-icon> All</button> <button class="preset-outline-surface-500 btn-sm"><iconify-icon></iconify-icon> None</button>',
		3
	),
	vn = C(
		'<div class="flex flex-wrap items-center gap-2"><span class="text-sm font-semibold"> </span> <button class="preset-filled-primary-500 btn-sm"><iconify-icon></iconify-icon> Download</button> <button class="preset-filled-secondary-500 btn-sm"><iconify-icon></iconify-icon> Tag</button> <button class="preset-filled-secondary-500 btn-sm"><iconify-icon></iconify-icon> Move</button> <button class="preset-filled-secondary-500 btn-sm"><iconify-icon></iconify-icon> Rename</button> <button class="preset-filled-error-500 btn-sm"><iconify-icon></iconify-icon> Delete</button></div>',
		2
	),
	hn = C(
		'<div class="flex h-full items-center justify-center text-center text-tertiary-500 dark:text-primary-500"><div><iconify-icon></iconify-icon> <p class="text-lg">No media found</p></div></div>',
		2
	),
	mn = C('<div class="absolute left-2 top-2 z-10"><input type="checkbox" class="checkbox" aria-label="Select file"/></div>'),
	pn = C('<tr><td class="font-semibold">Dimensions:</td><td> </td></tr>'),
	gn = C(
		'<div class="card preset-filled z-50 min-w-[250px] p-2 absolute left-8 top-0 shadow-xl" role="dialog" tabindex="-1"><table class=" w-full table-auto text-xs"><tbody><!><tr><td class="font-semibold">Size:</td><td> </td></tr><tr><td class="font-semibold">Type:</td><td> </td></tr><tr><td class="font-semibold">Hash:</td><td class="truncate"> </td></tr></tbody></table> <div class="flex justify-end mt-2"><button class="btn-icon btn-icon-sm preset-filled-surface-500" aria-label="Close"><iconify-icon></iconify-icon></button></div></div>',
		2
	),
	bn = C('<button aria-label="Edit" class="btn-icon"><iconify-icon></iconify-icon></button>', 2),
	yn = C('<!> <button aria-label="Delete" class="btn-icon"><iconify-icon></iconify-icon></button>', 3),
	_n = C('<img loading="lazy" decoding="async"/>'),
	xn = C('<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700"><iconify-icon></iconify-icon></div>', 2),
	wn = C(
		'<div role="button" tabindex="0"><!> <header class="m-2 flex w-auto items-center justify-between relative"><button aria-label="File Info" class="btn-icon"><iconify-icon></iconify-icon></button> <!> <!></header> <section class="flex items-center justify-center p-2"><!></section> <footer class="p-2 text-sm"><p class="truncate"> </p> <p class="text-xs text-gray-500"> </p> <p class="text-xs text-gray-500"> </p></footer></div>',
		2
	),
	kn = C('<div><div class="grid gap-4 svelte-14lax1z"></div></div>'),
	Sn = C('<span>New name prefix (files will be numbered)</span>'),
	Tn = C('<span>Destination folder</span>'),
	Cn = C('<span>Tags (comma-separated)</span>'),
	Rn = C(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="button" tabindex="-1" aria-label="Close modal"><div class="card w-full max-w-md p-6" role="dialog" tabindex="0" aria-labelledby="bulk-edit-title"><h3 id="bulk-edit-title" class="mb-4 text-xl font-bold"> </h3> <p class="mb-4 text-sm text-surface-600 dark:text-surface-50"> </p> <div class="mb-4"><label class="label mb-2" for="bulk-edit-input"><!></label> <input id="bulk-edit-input" type="text" class="input"/></div> <div class="flex justify-end gap-2"><button class="preset-outline-surface-500 btn">Cancel</button> <button class="preset-filled-primary-500 btn">Apply</button></div></div></div>'
	),
	An = C(
		'<div class="flex h-full flex-col"><div class="mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700"><div class="flex flex-wrap items-center gap-2"><button class="preset-outline-surface-500 btn-sm" aria-label="Toggle selection mode"><iconify-icon></iconify-icon> </button> <!></div> <!></div> <div class="flex-1 overflow-y-auto"><!></div> <div class="mt-2 flex items-center justify-between border-t border-surface-400 bg-surface-100 px-4 py-2 text-sm dark:bg-surface-700"><span> </span> <span> </span></div></div> <!>',
		3
	);
function Dn(D, e) {
	le(e, !0);
	const n = Tt(e, 'filteredFiles', 19, () => []),
		s = Tt(e, 'ondeleteImage', 3, () => {}),
		c = Tt(e, 'onBulkDelete', 3, () => {}),
		v = Tt(e, 'onBulkDownload', 3, () => {}),
		b = Tt(e, 'onBulkEdit', 3, () => {}),
		u = Tt(e, 'onEditImage', 3, () => {});
	let d = V(600),
		_ = V(0);
	const f = Pt(() => (e.gridSize === 'tiny' ? 120 : e.gridSize === 'small' ? 160 : e.gridSize === 'medium' ? 280 : 400));
	let g = V(5);
	const R = Pt(() => Math.ceil(t(d) / t(f)) + 2),
		N = Pt(() => Math.ceil(n().length / t(g))),
		O = Pt(() => Math.max(0, Math.floor(t(_) / t(f)) - 1)),
		w = Pt(() => Math.min(t(N), t(O) + t(R))),
		k = Pt(() => n().slice(t(O) * t(g), t(w) * t(g))),
		E = Pt(() => t(O) * t(f)),
		m = Pt(() => (t(N) - t(w)) * t(f));
	let z = V(Me(new Set())),
		S = V(!1),
		T = V(null),
		M = V(!1),
		p = V('tag'),
		G = V(''),
		L;
	function U() {
		if (!L) return;
		const tt = L.clientWidth,
			et = e.gridSize === 'tiny' ? 100 : e.gridSize === 'small' ? 140 : e.gridSize === 'medium' ? 260 : 380;
		o(g, Math.max(1, Math.floor(tt / et)), !0);
	}
	function Y(tt) {
		const et = tt.target;
		o(_, et.scrollTop, !0);
	}
	function Q(tt) {
		const et = tt._id?.toString() || tt.filename;
		(t(z).has(et) ? t(z).delete(et) : t(z).add(et), o(z, t(z), !0));
	}
	function dt() {
		o(z, new Set(n().map((tt) => tt._id?.toString() || tt.filename)), !0);
	}
	function lt() {
		o(z, new Set(), !0);
	}
	function X(tt) {
		s()(tt);
	}
	function P() {
		const tt = n().filter((et) => t(z).has(et._id?.toString() || et.filename));
		tt.length > 0 && (c()(tt), o(z, new Set(), !0), o(S, !1));
	}
	function H() {
		const tt = n().filter((et) => t(z).has(et._id?.toString() || et.filename));
		tt.length > 0 && v()(tt);
	}
	function W(tt) {
		(o(p, tt, !0), o(M, !0));
	}
	function x() {
		const tt = n().filter((et) => t(z).has(et._id?.toString() || et.filename));
		tt.length > 0 && t(G).trim() && (b()(tt, t(p), t(G)), o(M, !1), o(G, ''), o(z, new Set(), !0), o(S, !1));
	}
	Ma(() => {
		U();
		const tt = new ResizeObserver(() => {
			(U(), o(d, L.clientHeight, !0));
		});
		return (tt.observe(L), () => tt.disconnect());
	});
	var B = An(),
		q = ct(B),
		rt = i(q),
		kt = i(rt),
		ft = i(kt);
	ft.__click = () => {
		(o(S, !t(S)), o(z, new Set(), !0));
	};
	var zt = i(ft);
	($(() => l(zt, 'icon', t(S) ? 'mdi:close' : 'mdi:checkbox-multiple-marked')), l(zt, 'width', '20'));
	var pt = r(zt);
	a(ft);
	var Ft = r(ft, 2);
	{
		var J = (tt) => {
			var et = fn(),
				Rt = ct(et);
			Rt.__click = dt;
			var St = i(Rt);
			(l(St, 'icon', 'mdi:select-all'), l(St, 'width', '20'), nt(), a(Rt));
			var ut = r(Rt, 2);
			ut.__click = lt;
			var Bt = i(ut);
			(l(Bt, 'icon', 'mdi:select-off'), l(Bt, 'width', '20'), nt(), a(ut), h(tt, et));
		};
		K(Ft, (tt) => {
			t(S) && tt(J);
		});
	}
	a(kt);
	var vt = r(kt, 2);
	{
		var At = (tt) => {
			var et = vn(),
				Rt = i(et),
				St = i(Rt);
			a(Rt);
			var ut = r(Rt, 2);
			ut.__click = H;
			var Bt = i(ut);
			(l(Bt, 'icon', 'mdi:download'), l(Bt, 'width', '18'), nt(), a(ut));
			var re = r(ut, 2);
			re.__click = () => W('tag');
			var It = i(re);
			(l(It, 'icon', 'mdi:tag-multiple'), l(It, 'width', '18'), nt(), a(re));
			var gt = r(re, 2);
			gt.__click = () => W('move');
			var Ut = i(gt);
			(l(Ut, 'icon', 'mdi:folder-move'), l(Ut, 'width', '18'), nt(), a(gt));
			var Vt = r(gt, 2);
			Vt.__click = () => W('rename');
			var $t = i(Vt);
			(l($t, 'icon', 'mdi:rename-box'), l($t, 'width', '18'), nt(), a(Vt));
			var ae = r(Vt, 2);
			ae.__click = P;
			var Pe = i(ae);
			(l(Pe, 'icon', 'mdi:delete'), l(Pe, 'width', '18'), nt(), a(ae), a(et), $(() => at(St, `${t(z).size ?? ''} selected`)), h(tt, et));
		};
		K(vt, (tt) => {
			t(z).size > 0 && tt(At);
		});
	}
	a(rt);
	var Ct = r(rt, 2),
		Nt = i(Ct);
	{
		var ve = (tt) => {
				var et = hn(),
					Rt = i(et),
					St = i(Rt);
				(l(St, 'icon', 'bi:exclamation-circle-fill'), l(St, 'height', '44'), wt(St, 1, 'mb-2'), nt(2), a(Rt), a(et), h(tt, et));
			},
			Ae = (tt) => {
				var et = kn(),
					Rt = i(et);
				(Be(
					Rt,
					21,
					() => t(k),
					(St) => St._id?.toString() || St.filename,
					(St, ut) => {
						const Bt = Pt(() => t(ut)._id?.toString() || t(ut).filename),
							re = Pt(() => t(z).has(t(Bt)));
						var It = wn();
						((It.__click = () => t(S) && Q(t(ut))),
							(It.__keydown = (mt) => {
								t(S) && (mt.key === 'Enter' || mt.key === ' ') && (mt.preventDefault(), Q(t(ut)));
							}));
						var gt = i(It);
						{
							var Ut = (mt) => {
								var Dt = mn(),
									Gt = i(Dt);
								(Kt(Gt), (Gt.__change = () => Q(t(ut))), a(Dt), $(() => Pa(Gt, t(re))), h(mt, Dt));
							};
							K(gt, (mt) => {
								t(S) && mt(Ut);
							});
						}
						var Vt = r(gt, 2),
							$t = i(Vt);
						$t.__click = (mt) => {
							(mt.stopPropagation(), o(T, t(T) === t(Bt) ? null : t(Bt), !0));
						};
						var ae = i($t);
						(l(ae, 'icon', 'raphael:info'), l(ae, 'width', '20'), wt(ae, 1, 'text-tertiary-500 dark:text-primary-500'), a($t));
						var Pe = r($t, 2);
						{
							var Ot = (mt) => {
								var Dt = gn();
								((Dt.__click = (ze) => ze.stopPropagation()), (Dt.__keydown = (ze) => ze.stopPropagation()));
								var Gt = i(Dt),
									j = i(Gt),
									ht = i(j);
								{
									var Et = (ze) => {
										var Ue = pn(),
											Je = r(i(Ue)),
											Qe = i(Je);
										(a(Je), a(Ue), $(() => at(Qe, `${t(ut).width ?? ''}x${t(ut).height ?? ''}`)), h(ze, Ue));
									};
									K(ht, (ze) => {
										'width' in t(ut) && t(ut).width && 'height' in t(ut) && t(ut).height && ze(Et);
									});
								}
								var xt = r(ht),
									Jt = r(i(xt)),
									ee = i(Jt, !0);
								(a(Jt), a(xt));
								var pe = r(xt),
									Te = r(i(pe)),
									Ge = i(Te, !0);
								(a(Te), a(pe));
								var he = r(pe),
									oe = r(i(he)),
									Ie = i(oe, !0);
								(a(oe), a(he), a(j), a(Gt));
								var Oe = r(Gt, 2),
									Le = i(Oe);
								Le.__click = () => o(T, null);
								var He = i(Le);
								(l(He, 'icon', 'mdi:close'),
									l(He, 'width', '16'),
									a(Le),
									a(Oe),
									a(Dt),
									$(
										(ze, Ue) => {
											(at(ee, ze), at(Ge, t(ut).mimeType || 'N/A'), ye(oe, 'title', t(ut).hash), at(Ie, Ue));
										},
										[() => ta(t(ut).size || 0), () => t(ut).hash?.substring(0, 8) || 'N/A']
									),
									h(mt, Dt));
							};
							K(Pe, (mt) => {
								t(T) === t(Bt) && mt(Ot);
							});
						}
						var Lt = r(Pe, 2);
						{
							var _t = (mt) => {
								var Dt = yn(),
									Gt = ct(Dt);
								{
									var j = (xt) => {
										var Jt = bn();
										Jt.__click = () => u()(t(ut));
										var ee = i(Jt);
										(l(ee, 'icon', 'mdi:pen'), l(ee, 'width', '20'), wt(ee, 1, 'text-tertiary-500 dark:text-primary-500'), a(Jt), h(xt, Jt));
									};
									K(Gt, (xt) => {
										t(ut).type === 'image' && xt(j);
									});
								}
								var ht = r(Gt, 2);
								ht.__click = () => X(t(ut));
								var Et = i(ht);
								(l(Et, 'icon', 'mdi:delete'), l(Et, 'width', '20'), wt(Et, 1, 'text-error-500'), a(ht), h(mt, Dt));
							};
							K(Lt, (mt) => {
								t(S) || mt(_t);
							});
						}
						a(Vt);
						var te = r(Vt, 2),
							De = i(te);
						{
							var Se = (mt) => {
									var Dt = _n();
									($(() => {
										(ye(Dt, 'src', ('thumbnails' in t(ut) ? t(ut).thumbnails?.sm?.url : void 0) ?? t(ut).url ?? '/static/Default_User.svg'),
											ye(Dt, 'alt', t(ut).filename),
											wt(
												Dt,
												1,
												`rounded object-cover ${e.gridSize === 'tiny' ? 'h-16 w-16' : e.gridSize === 'small' ? 'h-24 w-24' : e.gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`,
												'svelte-14lax1z'
											));
									}),
										Ve('error', Dt, (Gt) => {
											const j = Gt.target;
											j && (j.src = '/static/Default_User.svg');
										}),
										ma(Dt),
										h(mt, Dt));
								},
								de = (mt) => {
									var Dt = xn(),
										Gt = i(Dt);
									(l(Gt, 'icon', 'bi:exclamation-triangle-fill'), l(Gt, 'height', '24'), wt(Gt, 1, 'text-warning-500'), a(Dt), h(mt, Dt));
								};
							K(De, (mt) => {
								t(ut)?.filename && t(ut)?.url ? mt(Se) : mt(de, !1);
							});
						}
						a(te);
						var Wt = r(te, 2),
							ne = i(Wt),
							yt = i(ne, !0);
						a(ne);
						var bt = r(ne, 2),
							jt = i(bt, !0);
						a(bt);
						var ue = r(bt, 2),
							Xt = i(ue, !0);
						(a(ue),
							a(Wt),
							a(It),
							$(
								(mt) => {
									(wt(
										It,
										1,
										`card relative border border-surface-300 transition-all hover:shadow-lg dark:border-surface-500 ${t(re) ? 'ring-2 ring-primary-500' : ''}`
									),
										ye(ne, 'title', t(ut).filename),
										at(yt, t(ut).filename),
										at(jt, mt),
										at(Xt, t(ut).type || 'Unknown'));
								},
								[() => ta(t(ut).size || 0)]
							),
							h(St, It));
					}
				),
					a(Rt),
					a(et),
					$(() => {
						(Ye(et, `padding-top: ${t(E) ?? ''}px; padding-bottom: ${t(m) ?? ''}px;`), Ye(Rt, `grid-template-columns: repeat(${t(g) ?? ''}, 1fr);`));
					}),
					h(tt, et));
			};
		K(Nt, (tt) => {
			n().length === 0 ? tt(ve) : tt(Ae, !1);
		});
	}
	(a(Ct),
		ca(
			Ct,
			(tt) => (L = tt),
			() => L
		));
	var we = r(Ct, 2),
		_e = i(we),
		Fe = i(_e);
	a(_e);
	var ke = r(_e, 2),
		Z = i(ke);
	(a(ke), a(we), a(q));
	var st = r(q, 2);
	{
		var Qt = (tt) => {
			var et = Rn();
			((et.__click = () => o(M, !1)),
				(et.__keydown = (_t) => {
					_t.key === 'Escape' && o(M, !1);
				}));
			var Rt = i(et);
			((Rt.__click = (_t) => _t.stopPropagation()), (Rt.__keydown = (_t) => _t.stopPropagation()));
			var St = i(Rt),
				ut = i(St);
			a(St);
			var Bt = r(St, 2),
				re = i(Bt);
			a(Bt);
			var It = r(Bt, 2),
				gt = i(It),
				Ut = i(gt);
			{
				var Vt = (_t) => {
						var te = Sn();
						h(_t, te);
					},
					$t = (_t) => {
						var te = Zt(),
							De = ct(te);
						{
							var Se = (Wt) => {
									var ne = Tn();
									h(Wt, ne);
								},
								de = (Wt) => {
									var ne = Cn();
									h(Wt, ne);
								};
							K(
								De,
								(Wt) => {
									t(p) === 'move' ? Wt(Se) : Wt(de, !1);
								},
								!0
							);
						}
						h(_t, te);
					};
				K(Ut, (_t) => {
					t(p) === 'rename' ? _t(Vt) : _t($t, !1);
				});
			}
			a(gt);
			var ae = r(gt, 2);
			(Kt(ae), a(It));
			var Pe = r(It, 2),
				Ot = i(Pe);
			Ot.__click = () => o(M, !1);
			var Lt = r(Ot, 2);
			((Lt.__click = x),
				a(Pe),
				a(Rt),
				a(et),
				$(
					(_t) => {
						(at(ut, `Bulk ${t(p) === 'rename' ? 'Rename' : t(p) === 'move' ? 'Move' : 'Tag'}`),
							at(re, `${t(z).size ?? ''} file${t(z).size !== 1 ? 's' : ''} selected`),
							ye(ae, 'placeholder', t(p) === 'rename' ? 'image-' : t(p) === 'move' ? '/folder/path' : 'tag1, tag2, tag3'),
							(Lt.disabled = _t));
					},
					[() => !t(G).trim()]
				),
				Re(
					ae,
					() => t(G),
					(_t) => o(G, _t)
				),
				h(tt, et));
		};
		K(st, (tt) => {
			t(M) && tt(Qt);
		});
	}
	($(
		(tt) => {
			(at(pt, ` ${t(S) ? 'Cancel' : 'Select'}`),
				Ye(Ct, `height: ${t(d) ?? ''}px;`),
				at(Fe, `Showing ${t(k).length ?? ''} of ${n().length ?? ''} files`),
				at(Z, `Virtual scrolling: ${tt ?? ''}% rendered`));
		},
		[() => Math.round((t(k).length / n().length) * 100)]
	),
		Ve('scroll', Ct, Y),
		h(D, B),
		ce());
}
Ee(['click', 'keydown', 'change']);
var In = C('<div class="mt-1 text-xs text-surface-600 dark:text-surface-50"> </div>'),
	En = C('<div class="mt-2 text-xs text-surface-600 dark:text-surface-50"> </div>'),
	Fn = C('<div class="mt-1 text-xs text-surface-600 dark:text-surface-50"> </div>'),
	Pn = C(
		'<div class="h-full w-full flex flex-col items-center justify-center p-4"><div class="card max-h-[85vh] w-full max-w-4xl flex flex-col overflow-hidden bg-surface-100 dark:bg-surface-800 shadow-xl" role="dialog" aria-labelledby="advanced-search-title" tabindex="0"><div class="flex-none border-b border-surface-300 p-4 dark:border-surface-600 bg-surface-200/50 dark:bg-surface-700/50"><h2 id="advanced-search-title" class="text-center text-2xl font-bold text-tertiary-500 underline dark:text-primary-500">Advanced Search</h2></div> <div class="flex-1 overflow-y-auto p-6"><form id="advanced-search-form" class="space-y-6"><div class="flex flex-wrap gap-2"><button type="button" class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"><iconify-icon></iconify-icon> <span>Recent (7 days)</span></button> <button type="button" class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"><iconify-icon></iconify-icon> <span>Recent (30 days)</span></button> <button type="button" class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"><iconify-icon></iconify-icon> <span>Large (>5MB)</span></button> <button type="button" class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"><iconify-icon></iconify-icon> <span>4K+ Images</span></button></div> <hr class="border-surface-300 dark:border-surface-600"/> <section><h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Basic Criteria</h3> <div class="grid gap-4 md:grid-cols-2"><label class="label"><span>Filename</span> <input type="text" class="input" placeholder="image.jpg"/></label> <label class="label"><span>Tags (comma-separated)</span> <input type="text" class="input" placeholder="landscape, nature"/> <!></label></div></section> <section><h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Dimensions</h3> <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><label class="label"><span>Min Width (px)</span> <input type="number" class="input" placeholder="1920"/></label> <label class="label"><span>Max Width (px)</span> <input type="number" class="input" placeholder="3840"/></label> <label class="label"><span>Min Height (px)</span> <input type="number" class="input" placeholder="1080"/></label> <label class="label"><span>Max Height (px)</span> <input type="number" class="input" placeholder="2160"/></label></div> <div class="mt-4"><label class="label"><span>Aspect Ratio</span> <select class="select"><option>Any</option><option>Landscape</option><option>Portrait</option><option>Square</option></select></label></div> <!></section> <section><h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">File Properties</h3> <div class="grid gap-4 md:grid-cols-3"><label class="label"><span>Min Size (MB)</span> <input type="number" class="input" placeholder="1" step="0.1"/></label> <label class="label"><span>Max Size (MB)</span> <input type="number" class="input" placeholder="50" step="0.1"/></label> <label class="label"><span>File Types</span> <input type="text" class="input" placeholder="image/jpeg, image/png"/></label></div></section> <section><h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Upload Dates</h3> <div class="grid gap-4 md:grid-cols-2"><label class="label"><span>Uploaded After</span> <input type="date" class="input"/></label> <label class="label"><span>Uploaded Before</span> <input type="date" class="input"/></label></div></section> <section><h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Metadata & EXIF</h3> <div class="grid gap-4 md:grid-cols-3"><label class="label"><span>Has EXIF Data</span> <select class="select"><option>Any</option><option>Yes</option><option>No</option></select></label> <label class="label"><span>Camera</span> <input type="text" class="input" placeholder="Canon EOS 5D"/> <!></label> <label class="label"><span>Location</span> <input type="text" class="input" placeholder="New York"/></label></div></section> <section><h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Advanced</h3> <div class="grid gap-4 md:grid-cols-2"><label class="label"><span>Dominant Color (hex)</span> <input type="text" class="input" placeholder="#FF5733"/></label> <label class="label"><span>Hash Match</span> <input type="text" class="input" placeholder="a1b2c3d4..."/></label></div> <label class="mt-4 flex items-center gap-2"><input type="checkbox" class="checkbox"/> <span>Show Duplicates Only</span></label></section></form></div> <div class="flex-none border-t border-surface-300 p-4 dark:border-surface-600 bg-surface-200/50 dark:bg-surface-700/50"><div class="flex items-center justify-between"><div class="text-sm hidden sm:block"><strong class="text-tertiary-500 dark:text-primary-500">Tip:</strong> Press <kbd class="preset-filled-tertiary-500 badge dark:preset-filled-primary-500">Ctrl+Enter</kbd> to search</div> <div class="flex gap-3 ml-auto"><button type="button" class="preset-outlined-surface-500 btn">Reset</button> <button type="button" class="preset-outlined-surface-500 btn">Cancel</button> <button type="submit" form="advanced-search-form" class="preset-filled-primary-500 btn"><iconify-icon></iconify-icon> Search</button></div></div></div></div></div>',
		2
	);
function zn(D, e) {
	le(e, !0);
	let n = V(
		Me({
			filename: '',
			tagsInput: '',
			minWidth: '',
			maxWidth: '',
			minHeight: '',
			maxHeight: '',
			aspectRatio: 'any',
			minSize: '',
			maxSize: '',
			fileTypesInput: '',
			uploadedAfter: '',
			uploadedBefore: '',
			hasEXIF: 'any',
			camera: '',
			location: '',
			dominantColor: '',
			showDuplicatesOnly: !1,
			hashMatch: ''
		})
	);
	const s = Pt(() => {
		const j = new Set(),
			ht = new Set(),
			Et = new Set();
		return (
			e.files.forEach((xt) => {
				if (xt.metadata && typeof xt.metadata == 'object' && 'tags' in xt.metadata) {
					const ee = xt.metadata.tags;
					Array.isArray(ee) && ee.forEach((pe) => j.add(pe));
				}
				if (xt.metadata && typeof xt.metadata == 'object' && 'exif' in xt.metadata) {
					const ee = xt.metadata.exif;
					ee && 'camera' in ee && typeof ee.camera == 'string' && ht.add(ee.camera);
				}
				const Jt = xt;
				Jt.width && Jt.height && Et.add(`${Jt.width}x${Jt.height}`);
			}),
			{ tags: Array.from(j).slice(0, 10), cameras: Array.from(ht).slice(0, 10), dimensions: Array.from(Et).slice(0, 10) }
		);
	});
	function c() {
		const j = {
			filename: t(n).filename || void 0,
			tags: t(n).tagsInput
				? t(n)
						.tagsInput.split(',')
						.map((ht) => ht.trim())
				: void 0,
			minWidth: t(n).minWidth ? parseInt(t(n).minWidth) : void 0,
			maxWidth: t(n).maxWidth ? parseInt(t(n).maxWidth) : void 0,
			minHeight: t(n).minHeight ? parseInt(t(n).minHeight) : void 0,
			maxHeight: t(n).maxHeight ? parseInt(t(n).maxHeight) : void 0,
			aspectRatio: t(n).aspectRatio !== 'any' ? t(n).aspectRatio : void 0,
			minSize: t(n).minSize ? parseInt(t(n).minSize) * 1024 * 1024 : void 0,
			maxSize: t(n).maxSize ? parseInt(t(n).maxSize) * 1024 * 1024 : void 0,
			fileTypes: t(n).fileTypesInput
				? t(n)
						.fileTypesInput.split(',')
						.map((ht) => ht.trim())
				: void 0,
			uploadedAfter: t(n).uploadedAfter ? new Date(t(n).uploadedAfter) : void 0,
			uploadedBefore: t(n).uploadedBefore ? new Date(t(n).uploadedBefore) : void 0,
			hasEXIF: t(n).hasEXIF !== 'any' ? t(n).hasEXIF === 'yes' : void 0,
			camera: t(n).camera || void 0,
			location: t(n).location || void 0,
			dominantColor: t(n).dominantColor || void 0,
			showDuplicatesOnly: t(n).showDuplicatesOnly,
			hashMatch: t(n).hashMatch || void 0
		};
		e.onSearch(j);
	}
	function v() {
		o(
			n,
			{
				filename: '',
				tagsInput: '',
				minWidth: '',
				maxWidth: '',
				minHeight: '',
				maxHeight: '',
				aspectRatio: 'any',
				minSize: '',
				maxSize: '',
				fileTypesInput: '',
				uploadedAfter: '',
				uploadedBefore: '',
				hasEXIF: 'any',
				camera: '',
				location: '',
				dominantColor: '',
				showDuplicatesOnly: !1,
				hashMatch: ''
			},
			!0
		);
	}
	function b(j) {
		j.key === 'Escape' ? e.onClose() : j.key === 'Enter' && j.ctrlKey && c();
	}
	var u = Pn(),
		d = i(u);
	((d.__click = (j) => j.stopPropagation()),
		(d.__keydown = (j) => {
			(j.key === 'Enter' && j.stopPropagation(), b(j));
		}));
	var _ = r(i(d), 2),
		f = i(_),
		g = i(f),
		R = i(g);
	R.__click = () => {
		const j = new Date();
		(j.setDate(j.getDate() - 7), (t(n).uploadedAfter = j.toISOString().split('T')[0]), (t(n).uploadedBefore = ''));
	};
	var N = i(R);
	(l(N, 'icon', 'mdi:calendar-week'), nt(2), a(R));
	var O = r(R, 2);
	O.__click = () => {
		const j = new Date();
		(j.setDate(j.getDate() - 30), (t(n).uploadedAfter = j.toISOString().split('T')[0]), (t(n).uploadedBefore = ''));
	};
	var w = i(O);
	(l(w, 'icon', 'mdi:calendar-month'), nt(2), a(O));
	var k = r(O, 2);
	k.__click = () => {
		((t(n).minSize = '5'), (t(n).maxSize = ''));
	};
	var E = i(k);
	(l(E, 'icon', 'mdi:file-star'), nt(2), a(k));
	var m = r(k, 2);
	m.__click = () => {
		((t(n).minWidth = '3840'), (t(n).minHeight = '2160'));
	};
	var z = i(m);
	(l(z, 'icon', 'mdi:monitor-screenshot'), nt(2), a(m), a(g));
	var S = r(g, 4),
		T = r(i(S), 2),
		M = i(T),
		p = r(i(M), 2);
	(Kt(p), a(M));
	var G = r(M, 2),
		L = r(i(G), 2);
	Kt(L);
	var U = r(L, 2);
	{
		var Y = (j) => {
			var ht = In(),
				Et = i(ht);
			(a(ht), $((xt) => at(Et, `Suggestions: ${xt ?? ''}`), [() => t(s).tags.join(', ')]), h(j, ht));
		};
		K(U, (j) => {
			t(s).tags.length > 0 && j(Y);
		});
	}
	(a(G), a(T), a(S));
	var Q = r(S, 2),
		dt = r(i(Q), 2),
		lt = i(dt),
		X = r(i(lt), 2);
	(Kt(X), a(lt));
	var P = r(lt, 2),
		H = r(i(P), 2);
	(Kt(H), a(P));
	var W = r(P, 2),
		x = r(i(W), 2);
	(Kt(x), a(W));
	var B = r(W, 2),
		q = r(i(B), 2);
	(Kt(q), a(B), a(dt));
	var rt = r(dt, 2),
		kt = i(rt),
		ft = r(i(kt), 2),
		zt = i(ft);
	zt.value = zt.__value = 'any';
	var pt = r(zt);
	pt.value = pt.__value = 'landscape';
	var Ft = r(pt);
	Ft.value = Ft.__value = 'portrait';
	var J = r(Ft);
	((J.value = J.__value = 'square'), a(ft), a(kt), a(rt));
	var vt = r(rt, 2);
	{
		var At = (j) => {
			var ht = En(),
				Et = i(ht);
			(a(ht), $((xt) => at(Et, `Common dimensions: ${xt ?? ''}`), [() => t(s).dimensions.join(', ')]), h(j, ht));
		};
		K(vt, (j) => {
			t(s).dimensions.length > 0 && j(At);
		});
	}
	a(Q);
	var Ct = r(Q, 2),
		Nt = r(i(Ct), 2),
		ve = i(Nt),
		Ae = r(i(ve), 2);
	(Kt(Ae), a(ve));
	var we = r(ve, 2),
		_e = r(i(we), 2);
	(Kt(_e), a(we));
	var Fe = r(we, 2),
		ke = r(i(Fe), 2);
	(Kt(ke), a(Fe), a(Nt), a(Ct));
	var Z = r(Ct, 2),
		st = r(i(Z), 2),
		Qt = i(st),
		tt = r(i(Qt), 2);
	(Kt(tt), a(Qt));
	var et = r(Qt, 2),
		Rt = r(i(et), 2);
	(Kt(Rt), a(et), a(st), a(Z));
	var St = r(Z, 2),
		ut = r(i(St), 2),
		Bt = i(ut),
		re = r(i(Bt), 2),
		It = i(re);
	It.value = It.__value = 'any';
	var gt = r(It);
	gt.value = gt.__value = 'yes';
	var Ut = r(gt);
	((Ut.value = Ut.__value = 'no'), a(re), a(Bt));
	var Vt = r(Bt, 2),
		$t = r(i(Vt), 2);
	Kt($t);
	var ae = r($t, 2);
	{
		var Pe = (j) => {
			var ht = Fn(),
				Et = i(ht);
			(a(ht), $((xt) => at(Et, `Found: ${xt ?? ''}`), [() => t(s).cameras.join(', ')]), h(j, ht));
		};
		K(ae, (j) => {
			t(s).cameras.length > 0 && j(Pe);
		});
	}
	a(Vt);
	var Ot = r(Vt, 2),
		Lt = r(i(Ot), 2);
	(Kt(Lt), a(Ot), a(ut), a(St));
	var _t = r(St, 2),
		te = r(i(_t), 2),
		De = i(te),
		Se = r(i(De), 2);
	(Kt(Se), a(De));
	var de = r(De, 2),
		Wt = r(i(de), 2);
	(Kt(Wt), a(de), a(te));
	var ne = r(te, 2),
		yt = i(ne);
	(Kt(yt), nt(2), a(ne), a(_t), a(f), a(_));
	var bt = r(_, 2),
		jt = i(bt),
		ue = r(i(jt), 2),
		Xt = i(ue);
	Xt.__click = v;
	var mt = r(Xt, 2);
	mt.__click = function (...j) {
		e.onClose?.apply(this, j);
	};
	var Dt = r(mt, 2),
		Gt = i(Dt);
	(l(Gt, 'icon', 'mdi:magnify'),
		l(Gt, 'width', '20'),
		nt(),
		a(Dt),
		a(ue),
		a(jt),
		a(bt),
		a(d),
		a(u),
		Ve('submit', f, (j) => {
			(j.preventDefault(), c());
		}),
		Re(
			p,
			() => t(n).filename,
			(j) => (t(n).filename = j)
		),
		Re(
			L,
			() => t(n).tagsInput,
			(j) => (t(n).tagsInput = j)
		),
		Re(
			X,
			() => t(n).minWidth,
			(j) => (t(n).minWidth = j)
		),
		Re(
			H,
			() => t(n).maxWidth,
			(j) => (t(n).maxWidth = j)
		),
		Re(
			x,
			() => t(n).minHeight,
			(j) => (t(n).minHeight = j)
		),
		Re(
			q,
			() => t(n).maxHeight,
			(j) => (t(n).maxHeight = j)
		),
		sa(
			ft,
			() => t(n).aspectRatio,
			(j) => (t(n).aspectRatio = j)
		),
		Re(
			Ae,
			() => t(n).minSize,
			(j) => (t(n).minSize = j)
		),
		Re(
			_e,
			() => t(n).maxSize,
			(j) => (t(n).maxSize = j)
		),
		Re(
			ke,
			() => t(n).fileTypesInput,
			(j) => (t(n).fileTypesInput = j)
		),
		Re(
			tt,
			() => t(n).uploadedAfter,
			(j) => (t(n).uploadedAfter = j)
		),
		Re(
			Rt,
			() => t(n).uploadedBefore,
			(j) => (t(n).uploadedBefore = j)
		),
		sa(
			re,
			() => t(n).hasEXIF,
			(j) => (t(n).hasEXIF = j)
		),
		Re(
			$t,
			() => t(n).camera,
			(j) => (t(n).camera = j)
		),
		Re(
			Lt,
			() => t(n).location,
			(j) => (t(n).location = j)
		),
		Re(
			Se,
			() => t(n).dominantColor,
			(j) => (t(n).dominantColor = j)
		),
		Re(
			Wt,
			() => t(n).hashMatch,
			(j) => (t(n).hashMatch = j)
		),
		Ha(
			yt,
			() => t(n).showDuplicatesOnly,
			(j) => (t(n).showDuplicatesOnly = j)
		),
		h(D, u),
		ce());
}
Ee(['click', 'keydown']);
var Mn = C(
	'<div class="flex w-full items-center gap-4"><div class="btn-group preset-outlined-surface-500"><button title="Add Text"><iconify-icon></iconify-icon></button> <button title="Draw Arrow"><iconify-icon></iconify-icon></button> <button title="Draw Rectangle"><iconify-icon></iconify-icon></button> <button title="Draw Circle"><iconify-icon></iconify-icon></button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <label class="flex items-center gap-2 text-sm" title="Stroke Color"><iconify-icon></iconify-icon> <input type="color" class="input-color svelte-1ybags9"/></label> <label class="flex items-center gap-2 text-sm" title="Fill Color"><iconify-icon></iconify-icon> <input type="color" class="input-color svelte-1ybags9"/></label> <div class="grow"></div> <button class="btn preset-outlined-error-500"><iconify-icon></iconify-icon> <span>Delete</span></button> <button class="btn preset-filled-success-500"><iconify-icon></iconify-icon> <span>Done</span></button></div>',
	2
);
function wa(D, e) {
	le(e, !0);
	var n = Mn(),
		s = i(n),
		c = i(s);
	let v;
	c.__click = () => e.onSetTool(e.currentTool === 'text' ? null : 'text');
	var b = i(c);
	(l(b, 'icon', 'mdi:format-text'), a(c));
	var u = r(c, 2);
	let d;
	u.__click = () => e.onSetTool(e.currentTool === 'arrow' ? null : 'arrow');
	var _ = i(u);
	(l(_, 'icon', 'mdi:arrow-top-right'), a(u));
	var f = r(u, 2);
	let g;
	f.__click = () => e.onSetTool(e.currentTool === 'rectangle' ? null : 'rectangle');
	var R = i(f);
	(l(R, 'icon', 'mdi:rectangle-outline'), a(f));
	var N = r(f, 2);
	let O;
	N.__click = () => e.onSetTool(e.currentTool === 'circle' ? null : 'circle');
	var w = i(N);
	(l(w, 'icon', 'mdi:circle-outline'), a(N), a(s));
	var k = r(s, 4),
		E = i(k);
	l(E, 'icon', 'mdi:water-opacity');
	var m = r(E, 2);
	(Kt(m), (m.__input = (U) => e.onStrokeColorChange(U.currentTarget.value)), a(k));
	var z = r(k, 2),
		S = i(z);
	l(S, 'icon', 'mdi:format-color-fill');
	var T = r(S, 2);
	(Kt(T), (T.__input = (U) => e.onFillColorChange(U.currentTarget.value)), a(z));
	var M = r(z, 4);
	M.__click = function (...U) {
		e.onDelete?.apply(this, U);
	};
	var p = i(M);
	(l(p, 'icon', 'mdi:delete-outline'), nt(2), a(M));
	var G = r(M, 2);
	G.__click = function (...U) {
		e.onApply?.apply(this, U);
	};
	var L = i(G);
	(l(L, 'icon', 'mdi:check'),
		nt(2),
		a(G),
		a(n),
		$(() => {
			((v = wt(c, 1, 'btn-sm', null, v, { active: e.currentTool === 'text' })),
				(d = wt(u, 1, 'btn-sm', null, d, { active: e.currentTool === 'arrow' })),
				(g = wt(f, 1, 'btn-sm', null, g, { active: e.currentTool === 'rectangle' })),
				(O = wt(N, 1, 'btn-sm', null, O, { active: e.currentTool === 'circle' })),
				Ze(m, e.strokeColor),
				Ze(T, e.fillColor));
		}),
		h(D, n),
		ce());
}
Ee(['click', 'input']);
class Nn {
	id;
	node;
	layer;
	kind;
	_onSelect = null;
	_onDestroy = null;
	constructor(e, n, s, c) {
		((this.id = e),
			(this.node = n),
			(this.layer = s),
			(this.kind = c),
			this.node.on('click tap', (v) => {
				((v.cancelBubble = !0), this._onSelect?.());
			}));
	}
	enableInteraction() {
		this.node.draggable(!0);
	}
	disableInteraction() {
		this.node.draggable(!1);
	}
	on(e, n) {
		this.node.on(e, n);
	}
	off(e) {
		this.node.off(e);
	}
	destroy() {
		try {
			this.node.destroy();
		} catch {}
		this._onDestroy?.();
	}
	onSelect(e) {
		this._onSelect = e;
	}
	onDestroy(e) {
		this._onDestroy = e;
	}
}
function jn(D, e, n, s = 'Text', c = 20, v = '#000') {
	const b = new it.Text({ x: e, y: n, text: s, fontSize: c, fontFamily: 'Arial', fill: v, draggable: !0, name: 'annotation-text' });
	return (D.add(b), b);
}
function Gn(D, e, n, s = 0, c = 0, v = '#f00', b = 'transparent', u = 2) {
	const d = new it.Rect({ x: e, y: n, width: s, height: c, stroke: v, fill: b, strokeWidth: u, draggable: !0, name: 'annotation-rect' });
	return (D.add(d), d);
}
function Un(D, e, n, s = 0, c = '#f00', v = 'transparent', b = 2) {
	const u = new it.Circle({ x: e, y: n, radius: s, stroke: c, fill: v, strokeWidth: b, draggable: !0, name: 'annotation-circle' });
	return (D.add(u), u);
}
function On(D, e, n = '#f00', s = 2) {
	const c = new it.Line({ points: e, stroke: n, strokeWidth: s, lineCap: 'round', lineJoin: 'round', name: 'annotation-line', draggable: !1 });
	return (D.add(c), c);
}
function Ln(D, e, n = '#f00', s = 2) {
	const c = new it.Arrow({
		points: e,
		stroke: n,
		fill: n,
		strokeWidth: s,
		pointerLength: 10,
		pointerWidth: 8,
		name: 'annotation-arrow',
		draggable: !1
	});
	return (D.add(c), c);
}
const ja = {
		anchorFill: '#3b82f6',
		anchorStroke: '#ffffff',
		anchorStrokeWidth: 2,
		anchorSize: 12,
		anchorCornerRadius: 6,
		borderStroke: '#3b82f6',
		borderStrokeWidth: 2,
		borderDash: []
	},
	Wn = {
		...ja,
		anchorFill: '#3b82f6',
		anchorStroke: '#ffffff',
		anchorSize: 14,
		anchorCornerRadius: 7,
		borderStroke: '#ffffff',
		borderStrokeWidth: 1.5
	},
	Bn = ja,
	ka = { stroke: 'rgba(255, 255, 255, 0.4)', strokeWidth: 1, listening: !1 },
	Hn = {
		keepRatio: !0,
		rotateEnabled: !0,
		rotationSnaps: [0, 90, 180, 270],
		rotateAnchorOffset: 40,
		enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
		boundBoxFunc: (D, e) => (e.width < 20 || e.height < 20 ? D : e)
	};
function Ga(D, e) {
	const n = new it.Transformer({ ...Bn, ...Hn, ...e });
	return (D.add(n), n.moveToTop(), n);
}
function aa(D, e) {
	try {
		if (!e) {
			(D.nodes([]), D.hide());
			return;
		}
		(D.nodes([e]), D.show(), D.forceUpdate(), D.moveToTop());
	} catch {
		try {
			(D.nodes([]), D.hide());
		} catch {}
	}
}
function Xn(D) {
	return Ga(D, { keepRatio: !1, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'] });
}
const Sa = aa;
function Vn(D, e, n) {
	const s = D.container().getBoundingClientRect(),
		c = e.absolutePosition(),
		v = window.scrollX,
		b = window.scrollY,
		u = document.createElement('textarea');
	(document.body.appendChild(u),
		(u.value = e.text()),
		(u.style.position = 'absolute'),
		(u.style.top = `${s.top + c.y + b}px`),
		(u.style.left = `${s.left + c.x + v}px`),
		(u.style.width = `${e.width()}px`),
		(u.style.height = `${e.height() + 10}px`),
		(u.style.fontSize = `${e.fontSize()}px`),
		(u.style.fontFamily = String(e.fontFamily()) || 'Arial'),
		(u.style.color = String(e.fill()) || '#000'),
		(u.style.lineHeight = String(e.lineHeight())),
		(u.style.padding = e.padding() + 'px'),
		(u.style.background = 'white'),
		(u.style.border = '1px solid #0066ff'),
		(u.style.boxShadow = '0 0 5px rgba(0,0,0,0.2)'),
		(u.style.margin = '0'),
		(u.style.resize = 'none'),
		(u.style.overflow = 'hidden'),
		(u.style.zIndex = '10000'),
		u.focus(),
		u.select());
	function d() {
		(n(u.value), document.body.removeChild(u), window.removeEventListener('keydown', _), u.removeEventListener('blur', d));
	}
	function _(f) {
		(f.key === 'Escape' && d(), f.key === 'Enter' && !f.shiftKey && d());
	}
	(window.addEventListener('keydown', _), u.addEventListener('blur', d));
}
const Yn = 'annotate';
function Xe(D) {
	return [`${D}.${Yn}`, `${D}.annotate`].join(' ');
}
function Jn(D, e) {
	le(e, !0);
	let n = V(null),
		s = V(Me([])),
		c = V(null),
		v = V(null),
		b = V('#ff0000'),
		u = V('transparent'),
		d = 2,
		_ = 20,
		f = V(!1),
		g = V(null),
		R = V(null),
		N = V(!1);
	je(() => {
		y.state.activeState === 'annotate'
			? (O(),
				y.setToolbarControls({
					component: wa,
					props: {
						currentTool: t(v),
						strokeColor: t(b),
						fillColor: t(u),
						onSetTool: (H) => {
							(o(v, H, !0), G());
						},
						onStrokeColorChange: (H) => {
							(o(b, H, !0), t(c)?.node.setAttrs({ stroke: H }));
						},
						onFillColorChange: (H) => {
							(o(u, H, !0), t(c)?.node.setAttrs({ fill: H }));
						},
						onDelete: () => L(),
						onApply: () => Y()
					}
				}))
			: (w(), y.state.toolbarControls?.component === wa && y.setToolbarControls(null));
	});
	function O() {
		const { stage: P, layer: H } = y.state;
		!P ||
			!H ||
			t(N) ||
			(o(N, !0),
			t(n) || o(n, Xn(H), !0),
			P.on(Xe('mousedown'), k),
			P.on(Xe('mousemove'), E),
			P.on(Xe('mouseup'), m),
			P.on(Xe('click'), z),
			P.on(Xe('dblclick'), S),
			(P.container().style.cursor = 'crosshair'));
	}
	function w() {
		const { stage: P } = y.state;
		!P ||
			!t(N) ||
			(o(N, !1),
			P.off(Xe('mousedown')),
			P.off(Xe('mousemove')),
			P.off(Xe('mouseup')),
			P.off(Xe('click')),
			P.off(Xe('dblclick')),
			P.container() && (P.container().style.cursor = 'default'),
			G(),
			o(v, null),
			o(f, !1),
			o(g, null));
	}
	function k(P) {
		if (P.target !== P.target.getStage()) return;
		const { stage: H, layer: W } = y.state;
		if (!H || !W) return;
		const x = H.getPointerPosition();
		if (x && t(v))
			switch ((G(), o(f, !0), o(R, x, !0), t(v))) {
				case 'text': {
					const B = jn(W, x.x, x.y, 'Text', _, t(b)),
						q = T(B, 'text');
					(p(q), o(f, !1), o(v, null), M(q.node));
					break;
				}
				case 'rect':
					o(g, Gn(W, x.x, x.y, 0, 0, t(b), t(u), d), !0);
					break;
				case 'circle':
					o(g, Un(W, x.x, x.y, 0, t(b), t(u), d), !0);
					break;
				case 'line':
					o(g, On(W, [x.x, x.y, x.x, x.y], t(b), d), !0);
					break;
				case 'arrow':
					o(g, Ln(W, [x.x, x.y, x.x, x.y], t(b), d), !0);
					break;
			}
	}
	function E() {
		if (!t(f) || !t(g) || !t(R)) return;
		const { stage: P, layer: H } = y.state;
		if (!P || !H) return;
		const W = P.getPointerPosition();
		if (W) {
			if (t(g) instanceof it.Rect) (t(g).width(W.x - t(R).x), t(g).height(W.y - t(R).y));
			else if (t(g) instanceof it.Circle) {
				const x = Math.hypot(W.x - t(R).x, W.y - t(R).y);
				t(g).radius(x);
			} else (t(g) instanceof it.Line || t(g) instanceof it.Arrow) && t(g).points([t(R).x, t(R).y, W.x, W.y]);
			H.batchDraw();
		}
	}
	function m() {
		if (!t(f) || !t(g) || !t(v)) return;
		o(f, !1);
		const P = T(t(g), t(v));
		(p(P), o(g, null), o(v, null), o(R, null), y.state.layer?.batchDraw());
	}
	function z(P) {
		t(f) || t(v) || (P.target === P.target.getStage() && G());
	}
	function S(P) {
		const H = P.target;
		if (H instanceof it.Text) {
			const W = t(s).find((x) => x.node === H);
			W && (p(W), M(W.node));
		}
	}
	function T(P, H) {
		const { layer: W } = y.state;
		if (!W) throw new Error('No layer');
		(P.name(`annotation-${H}`), P.draggable(!0));
		const x = new Nn(crypto.randomUUID(), P, W, H);
		return (x.onSelect(() => p(x)), o(s, [...t(s), x], !0), x);
	}
	function M(P) {
		const { stage: H } = y.state;
		H &&
			(P.hide(),
			t(n)?.hide(),
			Vn(H, P, (W) => {
				(P.text(W), P.show(), t(n)?.show(), t(n)?.forceUpdate(), y.state.layer?.batchDraw());
			}));
	}
	function p(P) {
		(o(c, P, !0), t(n) && Sa(t(n), P.node));
	}
	function G() {
		(o(c, null), t(n) && Sa(t(n), null));
	}
	function L() {
		if (!t(c)) return;
		const P = t(c).id;
		(t(c).destroy(),
			o(
				s,
				t(s).filter((H) => H.id !== P),
				!0
			),
			o(c, null),
			G());
	}
	function U(P = !0) {
		(G(),
			o(f, !1),
			o(v, null),
			o(g, null),
			P ? ([...t(s)].forEach((H) => H.destroy()), o(s, [], !0)) : t(s).forEach((H) => H.disableInteraction()),
			y.state.layer?.batchDraw());
	}
	function Y() {
		(y.takeSnapshot(), y.setActiveState(''));
	}
	function Q() {
		try {
			(w(), U(!0), t(n)?.destroy(), o(n, null));
		} catch {}
	}
	function dt() {}
	function lt() {
		Q();
	}
	var X = { cleanup: Q, saveState: dt, beforeExit: lt };
	return ce(X);
}
const qn = { key: 'annotate', title: 'Annotate', icon: 'mdi:draw', tool: Jn },
	Kn = Object.freeze(Object.defineProperty({ __proto__: null, default: qn }, Symbol.toStringTag, { value: 'Module' }));
var Zn = C(
	'<div class="flex w-full items-center gap-3"><button class="btn btn-sm preset-filled-primary-500" title="Add Blur Region"><iconify-icon></iconify-icon> <span class="hidden sm:inline">Add</span></button> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <span class="hidden text-sm sm:inline">Shape:</span> <div class="btn-group preset-outlined-surface-500"><button title="Rectangle"><iconify-icon></iconify-icon></button> <button title="Ellipse"><iconify-icon></iconify-icon></button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <span class="hidden text-sm sm:inline">Pattern:</span> <div class="btn-group preset-outlined-surface-500"><button title="Blur"><iconify-icon></iconify-icon></button> <button title="Pixelate"><iconify-icon></iconify-icon></button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <label class="flex items-center gap-2 text-sm"><span class="hidden sm:inline"> </span> <input type="range" min="5" step="1" class="range range-primary w-24"/> <span class="w-6 text-right text-xs"> </span></label> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <div class="btn-group preset-outlined-surface-500"><button class="btn btn-icon btn-sm" title="Rotate Region Left"><iconify-icon></iconify-icon></button> <button class="btn btn-icon btn-sm" title="Rotate Region Right"><iconify-icon></iconify-icon></button> <button class="btn btn-icon btn-sm" title="Flip Region"><iconify-icon></iconify-icon></button></div> <button class="btn btn-sm preset-outlined-error-500" title="Delete Selected Region"><iconify-icon></iconify-icon></button> <div class="grow"></div> <button class="btn btn-sm preset-outlined-surface-500"><iconify-icon></iconify-icon> <span class="hidden sm:inline">Reset</span></button> <button class="btn btn-sm preset-outlined-error-500"><iconify-icon></iconify-icon> <span class="hidden sm:inline">Cancel</span></button> <button class="btn btn-sm preset-filled-success-500"><iconify-icon></iconify-icon> <span class="hidden sm:inline">Apply</span></button></div>',
	2
);
function Ta(D, e) {
	le(e, !0);
	let n = Tt(e, 'hasActiveRegion', 3, !1);
	function s(pt) {
		const Ft = pt.currentTarget;
		e.onStrengthChange(parseInt(Ft.value, 10));
	}
	var c = Zn(),
		v = i(c);
	v.__click = function (...pt) {
		e.onAddRegion?.apply(this, pt);
	};
	var b = i(v);
	(l(b, 'icon', 'mdi:plus'), nt(2), a(v));
	var u = r(v, 6),
		d = i(u);
	let _;
	d.__click = () => e.onShapeChange('rectangle');
	var f = i(d);
	(l(f, 'icon', 'mdi:crop-square'), a(d));
	var g = r(d, 2);
	let R;
	g.__click = () => e.onShapeChange('ellipse');
	var N = i(g);
	(l(N, 'icon', 'mdi:circle-outline'), a(g), a(u));
	var O = r(u, 6),
		w = i(O);
	let k;
	w.__click = () => e.onPatternChange('blur');
	var E = i(w);
	(l(E, 'icon', 'mdi:blur'), a(w));
	var m = r(w, 2);
	let z;
	m.__click = () => e.onPatternChange('pixelate');
	var S = i(m);
	(l(S, 'icon', 'mdi:grid'), a(m), a(O));
	var T = r(O, 4),
		M = i(T),
		p = i(M, !0);
	a(M);
	var G = r(M, 2);
	(Kt(G), (G.__input = s));
	var L = r(G, 2),
		U = i(L, !0);
	(a(L), a(T));
	var Y = r(T, 4),
		Q = i(Y);
	Q.__click = function (...pt) {
		e.onRotateLeft?.apply(this, pt);
	};
	var dt = i(Q);
	(l(dt, 'icon', 'mdi:rotate-left'), a(Q));
	var lt = r(Q, 2);
	lt.__click = function (...pt) {
		e.onRotateRight?.apply(this, pt);
	};
	var X = i(lt);
	(l(X, 'icon', 'mdi:rotate-right'), a(lt));
	var P = r(lt, 2);
	P.__click = function (...pt) {
		e.onFlipHorizontal?.apply(this, pt);
	};
	var H = i(P);
	(l(H, 'icon', 'mdi:flip-horizontal'), a(P), a(Y));
	var W = r(Y, 2);
	W.__click = function (...pt) {
		e.onDeleteRegion?.apply(this, pt);
	};
	var x = i(W);
	(l(x, 'icon', 'mdi:delete'), a(W));
	var B = r(W, 4);
	B.__click = function (...pt) {
		e.onReset?.apply(this, pt);
	};
	var q = i(B);
	(l(q, 'icon', 'mdi:restore'), nt(2), a(B));
	var rt = r(B, 2);
	rt.__click = function (...pt) {
		e.onCancel?.apply(this, pt);
	};
	var kt = i(rt);
	(l(kt, 'icon', 'mdi:close'), nt(2), a(rt));
	var ft = r(rt, 2);
	ft.__click = function (...pt) {
		e.onApply?.apply(this, pt);
	};
	var zt = i(ft);
	(l(zt, 'icon', 'mdi:check'),
		nt(2),
		a(ft),
		a(c),
		$(() => {
			((_ = wt(d, 1, 'btn-sm', null, _, { active: e.shape === 'rectangle' })),
				(R = wt(g, 1, 'btn-sm', null, R, { active: e.shape === 'ellipse' })),
				(k = wt(w, 1, 'btn-sm', null, k, { active: e.pattern === 'blur' })),
				(z = wt(m, 1, 'btn-sm', null, z, { active: e.pattern === 'pixelate' })),
				at(p, e.pattern === 'pixelate' ? 'Size:' : 'Strength:'),
				ye(G, 'max', e.pattern === 'pixelate' ? 50 : 100),
				Ze(G, e.blurStrength),
				at(U, e.blurStrength),
				(Q.disabled = !n()),
				(lt.disabled = !n()),
				(P.disabled = !n()),
				(W.disabled = !n()));
		}),
		h(D, c),
		ce());
}
Ee(['click', 'input']);
class Qn {
	id;
	shapeNode;
	overlay;
	overlayGroup;
	transformer;
	toolbar;
	layer;
	imageNode;
	imageGroup;
	currentPattern;
	currentStrength;
	_onSelect = null;
	_onDestroy = null;
	_onClone = null;
	_cacheTimer = null;
	constructor(e) {
		((this.id = e.id), (this.layer = e.layer), (this.imageNode = e.imageNode), (this.imageGroup = e.imageGroup));
		const n = e.init || {};
		((this.currentPattern = n.pattern || 'blur'), (this.currentStrength = n.strength || 20));
		const s = n.width ?? 160,
			c = n.height ?? 120,
			v = n.x ?? 0,
			b = n.y ?? 0;
		(n.shape === 'ellipse'
			? (this.shapeNode = new it.Ellipse({
					x: v,
					y: b,
					radiusX: s / 2,
					radiusY: c / 2,
					stroke: 'white',
					strokeWidth: 1.5,
					draggable: !0,
					name: 'blurShape'
				}))
			: (this.shapeNode = new it.Rect({
					x: v - s / 2,
					y: b - c / 2,
					width: s,
					height: c,
					stroke: 'white',
					strokeWidth: 1.5,
					fill: 'rgba(59, 130, 246, 0.2)',
					draggable: !0,
					name: 'blurShape'
				})),
			this.shapeNode.id(this.id),
			this.imageGroup.add(this.shapeNode),
			(this.overlay = new it.Image({
				image: this.imageNode.image(),
				listening: !1,
				name: 'blurOverlay',
				x: this.imageNode.x(),
				y: this.imageNode.y(),
				width: this.imageNode.width(),
				height: this.imageNode.height(),
				scaleX: this.imageNode.scaleX(),
				scaleY: this.imageNode.scaleY(),
				rotation: this.imageNode.rotation(),
				cornerRadius: this.imageNode.cornerRadius()
			})),
			(this.overlayGroup = new it.Group({ listening: !1 })),
			this.overlayGroup.add(this.overlay),
			this.overlay.filters([]),
			this.overlayGroup.clipFunc(this.makeClipFunc()),
			this.imageGroup.add(this.overlayGroup),
			this.imageNode.zIndex(0),
			this.overlayGroup.zIndex(1),
			this.shapeNode.zIndex(2),
			this.layer.batchDraw(),
			this.shapeNode.on('dragmove transform', () => {
				(this.updateToolbarPosition(), this.updateOverlayClip(), this.layer.batchDraw());
			}),
			this.setPattern(this.currentPattern),
			this.setStrength(this.currentStrength),
			this.shapeNode.on('click tap', (u) => {
				((u.cancelBubble = !0), this._onSelect?.());
			}));
	}
	updateToolbarPosition() {
		if (!this.toolbar) return;
		const e = this.shapeNode;
		let n = { x: 0, y: 0 };
		e instanceof it.Rect ? (n = { x: e.width() / 2, y: e.height() + 20 }) : (n = { x: 0, y: e.radiusY() + 20 });
		const s = e.getTransform().point(n);
		(this.toolbar.position(s), this.toolbar.rotation(e.rotation()), this.layer.batchDraw());
	}
	updateOverlayClip() {
		const e = this.shapeNode.getSelfRect(),
			n = this.currentStrength * 2,
			s = this.shapeNode.x() - this.overlay.x(),
			c = this.shapeNode.y() - this.overlay.y(),
			v = { x: s - n, y: c - n, width: e.width + n * 2, height: e.height + n * 2 };
		(this._cacheTimer && window.clearTimeout(this._cacheTimer),
			(this._cacheTimer = window.setTimeout(() => {
				try {
					(this.overlayGroup.clearCache(), this.overlayGroup.cache(v), this.layer.batchDraw());
				} catch {}
				this._cacheTimer = null;
			}, 0)),
			this.layer.batchDraw());
	}
	makeClipFunc() {
		const e = this.shapeNode;
		return (n) => {
			const c = e.getTransform().copy().m;
			(n.setTransform(c[0], c[1], c[2], c[3], c[4], c[5]),
				e instanceof it.Ellipse
					? (n.beginPath(), n.ellipse(0, 0, e.radiusX(), e.radiusY(), 0, 0, Math.PI * 2), n.closePath())
					: (n.beginPath(), n.rect(0, 0, e.width(), e.height()), n.closePath()));
		};
	}
	setPattern(e) {
		((this.currentPattern = e),
			this.overlay.filters([]),
			e === 'blur' ? this.overlay.filters([it.Filters.Blur]) : this.overlay.filters([it.Filters.Pixelate]),
			this.setStrength(this.currentStrength),
			this.updateOverlayClip());
	}
	setStrength(e) {
		((this.currentStrength = e),
			this.currentPattern === 'blur' ? this.overlay.blurRadius(e) : this.overlay.pixelSize(Math.max(1, Math.round(e / 2))),
			this.updateOverlayClip());
	}
	resizeFromStart(e, n) {
		const s = n.x - e.x,
			c = n.y - e.y;
		this.shapeNode instanceof it.Ellipse
			? this.shapeNode.setAttrs({ x: e.x + s / 2, y: e.y + c / 2, radiusX: Math.abs(s / 2), radiusY: Math.abs(c / 2) })
			: this.shapeNode.setAttrs({ x: s > 0 ? e.x : n.x, y: c > 0 ? e.y : n.y, width: Math.abs(s), height: Math.abs(c) });
	}
	finalize() {
		((this.transformer = new it.Transformer({
			nodes: [this.shapeNode],
			anchorFill: '#3b82f6',
			anchorStroke: '#ffffff',
			anchorStrokeWidth: 2,
			anchorSize: 12,
			anchorCornerRadius: 6,
			borderStroke: '#ffffff',
			borderStrokeWidth: 1.5,
			borderDash: [],
			rotateEnabled: !0,
			rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
			rotateAnchorOffset: 25,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			keepRatio: !1,
			ignoreStroke: !0,
			boundBoxFunc: (e, n) => (n.width < 10 || n.height < 10 ? e : n)
		})),
			this.transformer.on('dragend transformend', () => {
				y.takeSnapshot();
			}),
			this.imageGroup.add(this.transformer),
			this.transformer.moveToTop(),
			this.shapeNode.on('dragend transformend', () => {
				y.takeSnapshot();
			}),
			this.createToolbar());
	}
	createToolbar() {
		this.toolbar && this.toolbar.destroy();
		const e = this.shapeNode.getClientRect(),
			n = e.y - 45,
			s = e.x + e.width / 2;
		this.toolbar = new it.Group({ x: s, y: n, name: 'blurToolbar' });
		const c = new it.Rect({
			x: -45,
			y: 0,
			width: 90,
			height: 36,
			fill: '#1f2937',
			cornerRadius: 8,
			shadowColor: 'black',
			shadowBlur: 10,
			shadowOpacity: 0.4
		});
		this.toolbar.add(c);
		const v = new it.Group({ x: -22, y: 18, cursor: 'pointer' });
		(v.add(
			new it.Path({ data: 'M12 4v16m8-8H4', stroke: 'white', strokeWidth: 2, lineCap: 'round', scale: { x: 0.8, y: 0.8 }, offset: { x: 12, y: 12 } })
		),
			v.on('click tap', (u) => {
				((u.cancelBubble = !0), this._onClone?.());
			}),
			v.on('mouseenter', () => {
				const u = this.layer.getStage();
				u && (u.container().style.cursor = 'pointer');
			}),
			v.on('mouseleave', () => {
				const u = this.layer.getStage();
				u && (u.container().style.cursor = 'crosshair');
			}),
			this.toolbar.add(v));
		const b = new it.Group({ x: 22, y: 18, cursor: 'pointer' });
		(b.add(
			new it.Path({
				data: 'M3 6h18M9 6v12M15 6v12M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
				stroke: 'white',
				strokeWidth: 2,
				scale: { x: 0.7, y: 0.7 },
				offset: { x: 12, y: 12 }
			})
		),
			b.on('click tap', (u) => {
				((u.cancelBubble = !0), this.destroy());
			}),
			b.on('mouseenter', () => {
				const u = this.layer.getStage();
				u && (u.container().style.cursor = 'pointer');
			}),
			b.on('mouseleave', () => {
				const u = this.layer.getStage();
				u && (u.container().style.cursor = 'crosshair');
			}),
			this.toolbar.add(b),
			this.imageGroup.add(this.toolbar),
			this.toolbar.zIndex(10),
			this.updateToolbarPosition());
	}
	isTooSmall() {
		const e = this.shapeNode;
		return e instanceof it.Ellipse ? e.radiusX() < 10 || e.radiusY() < 10 : e.width() < 20 || e.height() < 20;
	}
	setActive(e) {
		(this.transformer && this.transformer.visible(e),
			this.toolbar && this.toolbar.visible(e),
			e && (this.transformer?.moveToTop(), this.toolbar?.moveToTop(), this.updateToolbarPosition()),
			this.layer.batchDraw());
	}
	hideUI() {
		(this.transformer?.visible(!1), this.toolbar?.visible(!1), this.shapeNode.visible(!1));
	}
	cloneForBake() {
		try {
			return this.overlayGroup.clone();
		} catch {
			return null;
		}
	}
	rotate(e) {
		(this.shapeNode.rotate(e), this.updateToolbarPosition(), this.updateOverlayClip(), this.layer.batchDraw());
	}
	flipX() {
		(this.shapeNode.scaleX(this.shapeNode.scaleX() * -1), this.updateToolbarPosition(), this.updateOverlayClip(), this.layer.batchDraw());
	}
	destroy() {
		(this.shapeNode.off('dragmove transform click tap'),
			this.transformer?.destroy(),
			this.toolbar?.destroy(),
			this.overlayGroup.destroy(),
			this.shapeNode.destroy(),
			this._onDestroy?.());
	}
	onSelect(e) {
		this._onSelect = e;
	}
	onDestroy(e) {
		this._onDestroy = e;
	}
	onClone(e) {
		this._onClone = e;
	}
}
function $n(D, e) {
	le(e, !0);
	let n = V(20),
		s = V('blur'),
		c = V('rectangle'),
		v = V(Me([])),
		b = V(null),
		u = V(!1),
		d = null;
	(je(() => {
		y.state.activeState === 'blur'
			? (_(),
				y.setToolbarControls({
					component: Ta,
					props: {
						blurStrength: t(n),
						pattern: t(s),
						shape: t(c),
						onAdd: void 0,
						onDelete: void 0,
						onStrengthChange: (p) => {
							(o(n, p, !0),
								d && clearTimeout(d),
								(d = window.setTimeout(() => {
									(t(b)
										? t(v)
												.find((G) => G.id === t(b))
												?.setStrength(p)
										: t(v).forEach((G) => G.setStrength(p)),
										y.state.layer?.batchDraw());
								}, 30)));
						},
						onPatternChange: (p) => {
							(o(s, p, !0), t(v).forEach((G) => G.setPattern(p)));
						},
						onShapeChange: (p) => {
							if ((o(c, p, !0), t(b))) {
								const G = t(v).find((L) => L.id === t(b));
								if (G) {
									const U = G.shapeNode.getClientRect();
									(O(G.id), R({ x: U.x, y: U.y, width: U.width, height: U.height, shape: p }));
								}
							}
						},
						onAddRegion: () => {
							const p = y.state.stage,
								G = p ? p.width() / 2 : 100,
								L = p ? p.height() / 2 : 100;
							R({ x: G, y: L });
						},
						onDeleteRegion: () => {
							t(b) && O(t(b));
						},
						onRotateLeft: () => {
							t(b) &&
								t(v)
									.find((p) => p.id === t(b))
									?.rotate(-90);
						},
						onRotateRight: () => {
							t(b) &&
								t(v)
									.find((p) => p.id === t(b))
									?.rotate(90);
						},
						onFlipHorizontal: () => {
							t(b) &&
								t(v)
									.find((p) => p.id === t(b))
									?.flipX();
						},
						onReset: () => k(),
						onCancel: () => e.onCancel(),
						onApply: E
					}
				}))
			: (f(), y.state.toolbarControls?.component === Ta && y.setToolbarControls(null));
	}),
		je(() => {
			t(u) && t(v).length === 0 && R();
		}));
	function _() {
		const { stage: M } = y.state;
		!M || t(u) || (M.on('click tap', g), M.container() && (M.container().style.cursor = 'crosshair'), o(u, !0));
	}
	function f() {
		const { stage: M } = y.state;
		!M || !t(u) || (M.off('click tap', g), M.container() && (M.container().style.cursor = 'default'), o(u, !1));
	}
	function g(M) {
		const { stage: p, imageNode: G, imageGroup: L } = y.state,
			U = M.target;
		if (p && (U === p || U === G || U === L)) {
			const Y = p.getPointerPosition();
			Y && R({ x: Y.x - 100, y: Y.y - 75, width: 200, height: 150, shape: t(c) });
		}
	}
	function R(M) {
		const { stage: p, layer: G, imageNode: L, imageGroup: U } = y.state;
		if (!p || !G || !L || !U) return;
		const Y = new Qn({ id: crypto.randomUUID(), layer: G, imageNode: L, imageGroup: U, init: { shape: t(c), pattern: t(s), strength: t(n), ...M } });
		(o(v, [...t(v), Y], !0),
			o(b, Y.id, !0),
			Y.onSelect(() => N(Y.id)),
			Y.onClone(() => {
				const Q = Y.shapeNode.getClientRect();
				R({
					x: Q.x + 20,
					y: Q.y + 20,
					width: Q.width,
					height: Q.height,
					shape: Y.shapeNode instanceof it.Ellipse ? 'ellipse' : 'rectangle',
					pattern: t(s),
					strength: t(n)
				});
			}),
			Y.onDestroy(() => {
				(o(
					v,
					t(v).filter((Q) => Q.id !== Y.id),
					!0
				),
					t(b) === Y.id && o(b, null));
			}),
			Y.setPattern(t(s)),
			Y.setStrength(t(n)),
			Y.finalize(),
			N(Y.id));
	}
	function N(M) {
		(o(b, M, !0), t(v).forEach((p) => p.setActive(p.id === M)), y.state.layer?.batchDraw());
	}
	function O(M) {
		t(v)
			.find((G) => G.id === M)
			?.destroy();
	}
	function w(M = !0) {
		(M ? ([...t(v)].forEach((p) => p.destroy()), o(v, [], !0)) : t(v).forEach((p) => p.hideUI()), o(b, null), y.state.layer?.batchDraw());
	}
	function k() {
		w(!0);
	}
	function E() {
		(w(!1), y.takeSnapshot(), y.setActiveState(''));
	}
	function m() {
		try {
			(f(), w(!0));
		} catch {}
	}
	function z() {}
	function S() {
		m();
	}
	var T = { reset: k, apply: E, cleanup: m, saveState: z, beforeExit: S };
	return ce(T);
}
const tr = { key: 'blur', title: 'Blur', icon: 'mdi:blur', tool: $n },
	er = Object.freeze(Object.defineProperty({ __proto__: null, default: tr }, Symbol.toStringTag, { value: 'Module' }));
var ar = C(
	'<div class="flex items-center gap-3"><div class="btn-group preset-outlined-surface-500"><button class="btn-sm">Free</button> <button class="btn-sm">1:1</button> <button class="btn-sm">16:9</button> <button class="btn-sm">4:3</button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <div class="btn-group preset-outlined-surface-500"><button title="Rectangle"><iconify-icon></iconify-icon></button> <button title="Circle"><iconify-icon></iconify-icon></button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Rotate Left"><iconify-icon></iconify-icon></button> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Rotate Right"><iconify-icon></iconify-icon></button> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Flip Horizontal"><iconify-icon></iconify-icon></button> <div class="grow"></div> <button class="btn preset-outlined-error-500"><iconify-icon></iconify-icon> <span>Cancel</span></button> <button class="btn preset-filled-success-500"><iconify-icon></iconify-icon> <span>Apply Crop</span></button></div>',
	2
);
function Ca(D, e) {
	le(e, !0);
	var n = ar(),
		s = i(n),
		c = i(s);
	c.__click = () => e.onAspectRatio(null);
	var v = r(c, 2);
	v.__click = () => e.onAspectRatio(1);
	var b = r(v, 2);
	b.__click = () => e.onAspectRatio(16 / 9);
	var u = r(b, 2);
	((u.__click = () => e.onAspectRatio(4 / 3)), a(s));
	var d = r(s, 4),
		_ = i(d);
	let f;
	_.__click = () => e.onCropShapeChange('rectangle');
	var g = i(_);
	(l(g, 'icon', 'mdi:rectangle-outline'), a(_));
	var R = r(_, 2);
	let N;
	R.__click = () => e.onCropShapeChange('circular');
	var O = i(R);
	(l(O, 'icon', 'mdi:circle-outline'), a(R), a(d));
	var w = r(d, 4);
	w.__click = function (...L) {
		e.onRotateLeft?.apply(this, L);
	};
	var k = i(w);
	(l(k, 'icon', 'mdi:rotate-left'), a(w));
	var E = r(w, 2);
	E.__click = function (...L) {
		e.onRotateRight?.apply(this, L);
	};
	var m = i(E);
	(l(m, 'icon', 'mdi:rotate-right'), a(E));
	var z = r(E, 2);
	z.__click = function (...L) {
		e.onFlipHorizontal?.apply(this, L);
	};
	var S = i(z);
	(l(S, 'icon', 'mdi:flip-horizontal'), a(z));
	var T = r(z, 4);
	T.__click = function (...L) {
		e.onCancel?.apply(this, L);
	};
	var M = i(T);
	(l(M, 'icon', 'mdi:close'), nt(2), a(T));
	var p = r(T, 2);
	p.__click = function (...L) {
		e.onApply?.apply(this, L);
	};
	var G = i(p);
	(l(G, 'icon', 'mdi:check'),
		nt(2),
		a(p),
		a(n),
		$(() => {
			((f = wt(_, 1, 'btn-sm', null, f, { active: e.cropShape === 'rectangle' })),
				(N = wt(R, 1, 'btn-sm', null, N, { active: e.cropShape === 'circular' })));
		}),
		h(D, n),
		ce());
}
Ee(['click']);
function Ra(D) {
	if (!D || D === 'free') return null;
	const e = D.split(':').map((n) => Number(n));
	return e.length !== 2 || Number.isNaN(e[0]) || Number.isNaN(e[1]) || e[1] === 0 ? null : e[0] / e[1];
}
function ir(D, e, n = !0) {
	const s = D.findOne('.cropCut');
	if (s) {
		if (
			(e instanceof it.Circle && s instanceof it.Circle
				? (s.position(e.position()), s.radius(e.radius()), s.rotation(e.rotation()))
				: e instanceof it.Rect &&
					s instanceof it.Rect &&
					s.setAttrs({ x: e.x(), y: e.y(), width: e.width() * e.scaleX(), height: e.height() * e.scaleY(), rotation: e.rotation() }),
			n)
		) {
			const c = D.getStage();
			D.cache({ x: 0, y: 0, width: c?.width() ?? 0, height: c?.height() ?? 0, pixelRatio: 1 });
		}
		D.getLayer()?.batchDraw();
	}
}
class nr {
	id;
	layer;
	imageNode;
	imageGroup;
	shape;
	overlayGroup;
	gridGroup;
	transformer;
	aspect = null;
	_onTransform = null;
	_onTransformEnd = null;
	_onDestroy = null;
	constructor(e) {
		((this.id = e.id), (this.layer = e.layer), (this.imageNode = e.imageNode), (this.imageGroup = e.imageGroup));
		const n = e.init || {};
		((this.aspect = n.aspect ?? null), (this.overlayGroup = new it.Group({ name: 'cropOverlayGroup' })));
		const s = this.layer.getStage(),
			c = s?.width() ?? 0,
			v = s?.height() ?? 0,
			b = new it.Rect({ x: 0, y: 0, width: c, height: v, fill: 'rgba(0,0,0,0.8)', listening: !1, name: 'cropOverlay' });
		this.overlayGroup.add(b);
		const u = this.imageGroup.getClientRect(),
			d = Math.min(u.width, u.height) * 0.8,
			_ = u.x + u.width / 2,
			f = u.y + u.height / 2;
		let g, R;
		const N = Ra(this.aspect);
		if ((N ? ((g = d), (R = d / N)) : ((g = d), (R = d * 0.75)), n.shape === 'circular')) {
			const O = d / 2,
				w = new it.Circle({ x: _, y: f, radius: O, fill: 'black', globalCompositeOperation: 'destination-out', listening: !1, name: 'cropCut' });
			(this.overlayGroup.add(w),
				(this.shape = new it.Circle({ x: _, y: f, radius: O, stroke: 'white', strokeWidth: 3, draggable: !0, name: 'cropTool' })));
		} else {
			const O = new it.Rect({
				x: _ - g / 2,
				y: f - R / 2,
				width: g,
				height: R,
				fill: 'black',
				globalCompositeOperation: 'destination-out',
				listening: !1,
				name: 'cropCut'
			});
			(this.overlayGroup.add(O),
				(this.shape = new it.Rect({
					x: _ - g / 2,
					y: f - R / 2,
					width: g,
					height: R,
					stroke: 'white',
					strokeWidth: 1,
					draggable: !0,
					name: 'cropTool'
				})),
				this.createGrid());
		}
		(this.overlayGroup.cache({ x: 0, y: 0, width: c, height: v, pixelRatio: 1 }),
			this.layer.add(this.overlayGroup),
			this.layer.add(this.shape),
			this.imageGroup.zIndex(0),
			this.overlayGroup.zIndex(1),
			this.gridGroup?.zIndex(2),
			this.shape.zIndex(3),
			this.shape.on('dragmove transform', () => {
				(this._onTransform?.(), this.updateCutout(!1), this.updateGrid());
			}),
			this.shape.on('dragend transformend', () => {
				this._onTransformEnd?.();
			}));
	}
	createGrid() {
		if (this.shape instanceof it.Rect) {
			(this.gridGroup && this.gridGroup.destroy(), (this.gridGroup = new it.Group({ listening: !1 })));
			for (let e = 1; e <= 2; e++)
				(this.gridGroup.add(new it.Line({ name: `v${e}`, points: [0, 0, 0, 0], ...ka })),
					this.gridGroup.add(new it.Line({ name: `h${e}`, points: [0, 0, 0, 0], ...ka })));
			(this.layer.add(this.gridGroup), this.updateGrid());
		}
	}
	updateGrid() {
		if (!this.gridGroup || !(this.shape instanceof it.Rect)) return;
		const e = this.shape.x(),
			n = this.shape.y(),
			s = this.shape.width() * this.shape.scaleX(),
			c = this.shape.height() * this.shape.scaleY();
		for (let v = 1; v <= 2; v++) {
			const b = e + (s * v) / 3,
				u = this.gridGroup.findOne(`.v${v}`);
			u && u.points([b, n, b, n + c]);
			const d = n + (c * v) / 3,
				_ = this.gridGroup.findOne(`.h${v}`);
			_ && _.points([e, d, e + s, d]);
		}
	}
	updateCutout(e = !0) {
		ir(this.overlayGroup, this.shape, e);
	}
	centerIn(e) {
		const n = e.x + e.width / 2,
			s = e.y + e.height / 2;
		(this.shape.position({ x: n, y: s }), this.transformer?.forceUpdate());
	}
	attachTransformer() {
		this.transformer && this.transformer.destroy();
		const e = Ra(this.aspect ?? 'free'),
			n = this.shape instanceof it.Circle || this.aspect === '1:1' || (e !== null && typeof e == 'number');
		((this.transformer = new it.Transformer({
			nodes: [this.shape],
			...Wn,
			keepRatio: n,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			rotateEnabled: !1,
			boundBoxFunc: (s, c) => (c.width < 30 || c.height < 30 ? s : (e && n && this.shape instanceof it.Rect && (c.height = c.width / e), c))
		})),
			this.layer.add(this.transformer),
			this.transformer.zIndex(4),
			this.transformer.moveToTop());
	}
	hideUI() {
		(this.transformer?.visible(!1), this.shape.visible(!1), this.gridGroup?.visible(!1), this.overlayGroup.visible(!1), this.layer.batchDraw());
	}
	destroy() {
		(this.shape.off('dragmove transform dragend transformend'),
			this.transformer?.destroy(),
			this.gridGroup?.destroy(),
			this.overlayGroup.destroy(),
			this.shape.destroy(),
			this._onDestroy?.());
	}
	onTransform(e) {
		this._onTransform = e;
	}
	onTransformEnd(e) {
		this._onTransformEnd = e;
	}
	onDestroy(e) {
		this._onDestroy = e;
	}
}
function rr(D, e) {
	le(e, !0);
	let n = V('rectangle'),
		s = V('free'),
		c = V(null),
		v = V(!1);
	je(() => {
		y.state.activeState === 'crop'
			? (b(),
				y.setToolbarControls({
					component: Ca,
					props: {
						cropShape: t(n),
						onRotateLeft: _,
						onRotateRight: g,
						onFlipHorizontal: f,
						onCropShapeChange: (m) => {
							(o(n, m, !0),
								(m === 'square' || m === 'circular') && o(s, '1:1'),
								m === 'circular' && ti('Round Crop selected. Image will be saved with transparency.', 'info'),
								d());
						},
						onAspectRatio: (m) => {
							(o(s, m === null ? 'free' : `${m}`, !0), m === 1 ? o(n, t(n) === 'circular' ? 'circular' : 'square', !0) : o(n, 'rectangle'), d());
						},
						onApply: R,
						onCancel: () => e.onCancel()
					}
				}))
			: (u(), y.state.toolbarControls?.component === Ca && y.setToolbarControls(null));
	});
	function b() {
		t(v) || (o(v, !0), d());
	}
	function u() {
		t(v) && (o(v, !1), N());
	}
	function d() {
		const { stage: E, layer: m, imageNode: z, imageGroup: S } = y.state;
		if (!E || !m || !z || !S) return;
		t(c) && (t(c).destroy(), o(c, null));
		const T = new nr({ id: crypto.randomUUID(), layer: m, imageNode: z, imageGroup: S, init: { shape: t(n), aspect: t(s) } });
		(T.onTransform(() => {
			T.updateCutout(!1);
		}),
			T.onTransformEnd(() => {
				T.updateCutout(!0);
			}),
			T.attachTransformer(),
			o(c, T, !0),
			m.batchDraw());
	}
	function _() {
		const { imageGroup: E, layer: m } = y.state;
		if (!E || !m) return;
		const S = (E.rotation() - 90) % 360;
		(E.rotation(S), t(c) && (t(c).centerIn(E.getClientRect()), t(c).updateCutout(!0)), m.batchDraw());
	}
	function f() {
		const { imageGroup: E, layer: m } = y.state;
		!E || !m || (E.scaleX(E.scaleX() * -1), t(c) && (t(c).centerIn(E.getClientRect()), t(c).updateCutout(!0)), m.batchDraw());
	}
	function g() {
		const { imageGroup: E, layer: m } = y.state;
		if (!E || !m) return;
		const S = (E.rotation() + 90) % 360;
		(E.rotation(S), t(c) && (t(c).centerIn(E.getClientRect()), t(c).updateCutout(!0)), m.batchDraw());
	}
	function R() {
		const { imageNode: E, imageGroup: m, layer: z, stage: S } = y.state;
		!E ||
			!m ||
			!t(c) ||
			!z ||
			!S ||
			$a(
				async () => {
					const { stageRectToImageRect: T } = await import('../chunks/Jwj1YebI.js');
					return { stageRectToImageRect: T };
				},
				__vite__mapDeps([0, 1, 2, 3]),
				import.meta.url
			).then(({ stageRectToImageRect: T }) => {
				const M = t(c).shape.getClientRect(),
					p = T(M, E, m);
				(E.cropX(p.x),
					E.cropY(p.y),
					E.cropWidth(p.width),
					E.cropHeight(p.height),
					E.width(p.width),
					E.height(p.height),
					E.x(-p.width / 2),
					E.y(-p.height / 2),
					t(n) === 'circular' ? E.cornerRadius(Math.max(p.width, p.height)) : E.cornerRadius(0));
				const G = S.width(),
					L = S.height(),
					U = (G * 0.8) / p.width,
					Y = (L * 0.8) / p.height,
					Q = Math.min(U, Y);
				(m.scaleX(Q), m.scaleY(Q), m.rotation(0), m.x(G / 2), m.y(L / 2), t(c).hideUI(), z.batchDraw(), y.takeSnapshot(), y.setActiveState(''));
			});
	}
	function N() {
		(t(c) && (t(c).destroy(), o(c, null)), y.state.layer?.batchDraw());
	}
	function O() {}
	function w() {
		N();
	}
	var k = { cleanup: N, saveState: O, beforeExit: w };
	return ce(k);
}
const or = { key: 'crop', title: 'Crop', icon: 'mdi:crop', tool: rr },
	sr = Object.freeze(Object.defineProperty({ __proto__: null, default: or }, Symbol.toStringTag, { value: 'Module' }));
var lr = C('<button><iconify-icon></iconify-icon> <span class="text-[10px] uppercase tracking-tighter leading-none"> </span></button>', 2),
	cr = C(
		'<div class="flex w-full items-center gap-4"><div class="flex-1 overflow-x-auto no-scrollbar py-1 svelte-z3h887"><div class="flex items-center gap-1 min-w-max px-2"></div></div> <div class="w-48 px-2 flex flex-col gap-1"><div class="flex justify-between text-[10px] text-surface-500 uppercase font-bold"><span> </span> <span> </span></div> <input type="range" min="-100" max="100" step="1" class="range range-primary range-sm"/></div> <button class="btn-sm btn-icon preset-outlined-surface-500" title="Reset this adjustment"><iconify-icon></iconify-icon></button> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <button class="btn preset-outlined-error-500"><iconify-icon></iconify-icon> <span>Cancel</span></button> <button class="btn preset-filled-success-500"><iconify-icon></iconify-icon> <span>Apply</span></button></div>',
		2
	);
function Aa(D, e) {
	le(e, !0);
	const n = [
		{ key: 'brightness', label: 'Brightness', icon: 'mdi:brightness-6' },
		{ key: 'contrast', label: 'Contrast', icon: 'mdi:contrast-box' },
		{ key: 'saturation', label: 'Saturation', icon: 'mdi:palette' },
		{ key: 'exposure', label: 'Exposure', icon: 'mdi:brightness-7' },
		{ key: 'highlights', label: 'Highlights', icon: 'mdi:white-balance-sunny' },
		{ key: 'shadows', label: 'Shadows', icon: 'mdi:weather-night' },
		{ key: 'temperature', label: 'Temperature', icon: 'mdi:thermometer' },
		{ key: 'clarity', label: 'Clarity', icon: 'mdi:crystal-ball' },
		{ key: 'vibrance', label: 'Vibrance', icon: 'mdi:vibrate' }
	];
	function s(S) {
		const T = S.currentTarget;
		e.onChange(parseInt(T.value, 10));
	}
	var c = cr(),
		v = i(c),
		b = i(v);
	(Be(
		b,
		21,
		() => n,
		Ke,
		(S, T) => {
			var M = lr();
			let p;
			M.__click = () => e.onAdjustmentChange(t(T).key);
			var G = i(M);
			($(() => l(G, 'icon', t(T).icon)), l(G, 'width', '18'));
			var L = r(G, 2),
				U = i(L, !0);
			(a(L),
				a(M),
				$(() => {
					((p = wt(M, 1, 'btn-sm preset-outlined-surface-500flex flex-col items-center gap-1 w-20 h-14', null, p, {
						'preset-filled-primary-500': e.activeAdjustment === t(T).key
					})),
						ye(M, 'title', t(T).label),
						at(U, t(T).label));
				}),
				h(S, M));
		}
	),
		a(b),
		a(v));
	var u = r(v, 2),
		d = i(u),
		_ = i(d),
		f = i(_, !0);
	a(_);
	var g = r(_, 2),
		R = i(g, !0);
	(a(g), a(d));
	var N = r(d, 2);
	(Kt(N), (N.__input = s), a(u));
	var O = r(u, 2);
	O.__click = function (...S) {
		e.onReset?.apply(this, S);
	};
	var w = i(O);
	(l(w, 'icon', 'mdi:restore'), a(O));
	var k = r(O, 4);
	k.__click = function (...S) {
		e.onCancel?.apply(this, S);
	};
	var E = i(k);
	(l(E, 'icon', 'mdi:close'), nt(2), a(k));
	var m = r(k, 2);
	m.__click = function (...S) {
		e.onApply?.apply(this, S);
	};
	var z = i(m);
	(l(z, 'icon', 'mdi:check'),
		nt(2),
		a(m),
		a(c),
		$(
			(S) => {
				(at(f, S), wt(g, 1, Ba(e.value !== 0 ? 'text-primary-500' : '')), at(R, e.value), Ze(N, e.value), (O.disabled = e.value === 0));
			},
			[() => n.find((S) => S.key === e.activeAdjustment)?.label]
		),
		h(D, c),
		ce());
}
Ee(['click', 'input']);
const Da = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, exposure: 0, highlights: 0, shadows: 0, clarity: 0, vibrance: 0 };
function dr(D, e) {
	(D.brightness(e.brightness / 100), D.contrast(e.contrast / 100));
	const n = (e.saturation + e.vibrance * 0.7) / 100;
	D.saturation(n);
}
function ur(D) {
	const e = 1 + D.exposure / 100,
		n = 1 + D.highlights / 100,
		s = 1 + D.shadows / 100,
		c = 1 + D.clarity / 100,
		v = 128;
	return function (b) {
		const u = b.data;
		for (let d = 0; d < u.length; d += 4) {
			let _ = u[d],
				f = u[d + 1],
				g = u[d + 2];
			D.exposure !== 0 && ((_ *= e), (f *= e), (g *= e));
			const R = 0.299 * _ + 0.587 * f + 0.114 * g;
			if (D.highlights !== 0 && R > 150) {
				const N = (R - 150) / 105,
					O = 1 + (n - 1) * N;
				((_ *= O), (f *= O), (g *= O));
			}
			if (D.shadows !== 0 && R < 100) {
				const N = (100 - R) / 100,
					O = 1 + (s - 1) * N;
				((_ *= O), (f *= O), (g *= O));
			}
			if ((D.clarity !== 0 && ((_ = v + (_ - v) * c), (f = v + (f - v) * c), (g = v + (g - v) * c)), D.temperature !== 0)) {
				const N = (D.temperature / 100) * 20;
				((_ += N), (g -= N));
			}
			((u[d] = Math.min(255, Math.max(0, _))), (u[d + 1] = Math.min(255, Math.max(0, f))), (u[d + 2] = Math.min(255, Math.max(0, g))));
		}
	};
}
function fr(D, e) {
	le(e, !0);
	let n = V(Me({ ...Da })),
		s = V('brightness');
	const c = [
		{ key: 'brightness', label: 'Brightness', icon: 'mdi:brightness-6' },
		{ key: 'contrast', label: 'Contrast', icon: 'mdi:contrast-box' },
		{ key: 'saturation', label: 'Saturation', icon: 'mdi:palette' },
		{ key: 'exposure', label: 'Exposure', icon: 'mdi:brightness-7' },
		{ key: 'highlights', label: 'Highlights', icon: 'mdi:white-balance-sunny' },
		{ key: 'shadows', label: 'Shadows', icon: 'mdi:weather-night' },
		{ key: 'temperature', label: 'Temperature', icon: 'mdi:thermometer' },
		{ key: 'clarity', label: 'Clarity', icon: 'mdi:crystal-ball' },
		{ key: 'vibrance', label: 'Vibrance', icon: 'mdi:vibrate' }
	];
	let v = V(!1),
		b = null;
	(je(() => {
		y.state.activeState === 'finetune'
			? (u(),
				y.setToolbarControls({
					component: Aa,
					props: {
						activeAdjustment: t(s),
						activeIcon: c.find((k) => k.key === t(s))?.icon,
						value: t(n)[t(s)],
						onChange: (k) => {
							t(n)[t(s)] = k;
						},
						onAdjustmentChange: (k) => {
							o(s, k, !0);
						},
						onReset: () => _(),
						onCancel: () => e.onCancel(),
						onApply: () => f()
					}
				}))
			: (d(), y.state.toolbarControls?.component === Aa && y.setToolbarControls(null));
	}),
		je(() => {
			if (!t(v)) return;
			const w = JSON.parse(JSON.stringify(t(n)));
			(b && clearTimeout(b),
				(b = window.setTimeout(() => {
					const { imageNode: k, layer: E } = y.state;
					if (!k || !E) return;
					console.log('Applying FineTune adjustments:', w);
					const m = [];
					(m.push(it.Filters.Brighten),
						m.push(it.Filters.Contrast),
						m.push(it.Filters.HSL),
						(t(n).exposure !== 0 || t(n).highlights !== 0 || t(n).shadows !== 0 || t(n).clarity !== 0 || t(n).temperature !== 0) && m.push(ur(w)),
						k.filters(m),
						dr(k, w),
						k.clearCache(),
						k.cache(),
						E.batchDraw());
				}, 100)));
		}));
	function u() {
		t(v) || (o(v, !0), o(n, { ...Da }, !0));
	}
	function d() {
		t(v) && (o(v, !1), b && clearTimeout(b));
	}
	function _() {
		t(n)[t(s)] = 0;
	}
	function f() {
		(y.takeSnapshot(), y.setActiveState(''));
	}
	function g() {
		try {
			d();
		} catch {}
	}
	function R() {}
	function N() {
		g();
	}
	var O = { cleanup: g, saveState: R, beforeExit: N };
	return ce(O);
}
const vr = { key: 'finetune', title: 'Fine-Tune', icon: 'mdi:tune', tool: fr },
	hr = Object.freeze(Object.defineProperty({ __proto__: null, default: vr }, Symbol.toStringTag, { value: 'Module' }));
var mr = C(
	'<div class="flex items-center gap-4 flex-wrap"><div class="flex items-center gap-2"><span class="text-sm font-medium">Focal Point:</span> <div class="flex items-center gap-1"><span class="badge variant-soft-primary text-xs"> </span> <span class="badge variant-soft-primary text-xs"> </span></div></div> <span class="text-xs text-surface-600 dark:text-surface-50">Click on the image to set focal point</span> <div class="flex-1"></div> <div class="flex items-center gap-2"><button class="btn preset-outlined-surface-500btn-sm" title="Reset to center"><iconify-icon></iconify-icon> <span>Reset</span></button> <button class="btn preset-outlined-error-500 btn-sm" title="Discard changes"><iconify-icon></iconify-icon> <span>Cancel</span></button> <button class="btn preset-filled-primary-500 btn-sm" title="Apply focal point"><iconify-icon></iconify-icon> <span>Apply</span></button></div></div>',
	2
);
function fa(D, e) {
	const n = Tt(e, 'focalX', 3, 50),
		s = Tt(e, 'focalY', 3, 50),
		c = Tt(e, 'onReset', 3, () => {}),
		v = Tt(e, 'onApply', 3, () => {}),
		b = Tt(e, 'onCancel', 3, () => {});
	var u = mr(),
		d = i(u),
		_ = r(i(d), 2),
		f = i(_),
		g = i(f);
	a(f);
	var R = r(f, 2),
		N = i(R);
	(a(R), a(_), a(d));
	var O = r(d, 6),
		w = i(O);
	w.__click = function (...T) {
		c()?.apply(this, T);
	};
	var k = i(w);
	(l(k, 'icon', 'mdi:restore'), l(k, 'width', '18'), nt(2), a(w));
	var E = r(w, 2);
	E.__click = function (...T) {
		b()?.apply(this, T);
	};
	var m = i(E);
	(l(m, 'icon', 'mdi:close'), l(m, 'width', '18'), nt(2), a(E));
	var z = r(E, 2);
	z.__click = function (...T) {
		v()?.apply(this, T);
	};
	var S = i(z);
	(l(S, 'icon', 'mdi:check'),
		l(S, 'width', '18'),
		nt(2),
		a(z),
		a(O),
		a(u),
		$(() => {
			(at(g, `X: ${n() ?? ''}%`), at(N, `Y: ${s() ?? ''}%`));
		}),
		h(D, u));
}
Ee(['click']);
function pr(D, e) {
	le(e, !0);
	let n = V(Me({ x: 0.5, y: 0.5 })),
		s = V(null),
		c = V(null),
		v = V(!1);
	je(() => {
		y.state.activeState === 'focalpoint'
			? (b(),
				y.setToolbarControls({
					component: fa,
					props: {
						focalX: Math.round(t(n).x * 100),
						focalY: Math.round(t(n).y * 100),
						onReset: () => R(),
						onCancel: () => e.onCancel(),
						onApply: () => N()
					}
				}))
			: (u(), y.state.toolbarControls?.component === fa && y.setToolbarControls(null));
	});
	function b() {
		const { stage: m, imageNode: z } = y.state;
		if (!m || !z || t(v)) return;
		o(v, !0);
		const S = z.metadata;
		(S?.focalPoint && o(n, { ...S.focalPoint }, !0),
			d(),
			_(),
			m.on('click.focalpoint tap.focalpoint', f),
			(m.container().style.cursor = 'crosshair'));
	}
	function u() {
		const { stage: m } = y.state;
		!m ||
			!t(v) ||
			(o(v, !1),
			m.off('click.focalpoint tap.focalpoint'),
			m.container() && (m.container().style.cursor = 'default'),
			t(s)?.destroy(),
			o(s, null),
			o(c, null));
	}
	function d() {
		const { stage: m, imageNode: z, imageGroup: S } = y.state;
		if (!m || !z || !S) return;
		(o(s, new it.Layer(), !0), m.add(t(s)), t(s).moveToTop());
		const T = z.width() * z.scaleX(),
			M = z.height() * z.scaleY(),
			p = S.x(),
			G = S.y(),
			L = p - T / 2,
			U = G - M / 2,
			Y = '#00ff00',
			Q = 1,
			dt = 0.7;
		for (let lt = 1; lt <= 2; lt++) {
			const X = L + (T / 3) * lt,
				P = new it.Line({ points: [X, U, X, U + M], stroke: Y, strokeWidth: Q, opacity: dt, listening: !1 });
			t(s).add(P);
		}
		for (let lt = 1; lt <= 2; lt++) {
			const X = U + (M / 3) * lt,
				P = new it.Line({ points: [L, X, L + T, X], stroke: Y, strokeWidth: Q, opacity: dt, listening: !1 });
			t(s).add(P);
		}
		t(s).batchDraw();
	}
	function _() {
		const { imageNode: m, imageGroup: z } = y.state;
		if (!t(s) || !m || !z) return;
		const S = m.width() * m.scaleX(),
			T = m.height() * m.scaleY(),
			M = z.x(),
			p = z.y(),
			G = M - S / 2,
			L = p - T / 2,
			U = G + S * t(n).x,
			Y = L + T * t(n).y;
		o(c, new it.Group({ x: U, y: Y, listening: !1 }), !0);
		const Q = 20,
			dt = '#ff0000',
			lt = 2,
			X = new it.Line({ points: [-Q, 0, Q, 0], stroke: dt, strokeWidth: lt }),
			P = new it.Line({ points: [0, -Q, 0, Q], stroke: dt, strokeWidth: lt }),
			H = new it.Circle({ radius: 4, fill: dt, stroke: '#ffffff', strokeWidth: 2 });
		(t(c).add(X, P, H), t(s).add(t(c)), t(s).batchDraw());
	}
	function f() {
		const { stage: m, imageNode: z, imageGroup: S } = y.state;
		if (!m || !z || !S) return;
		const T = m.getPointerPosition();
		if (!T) return;
		const M = z.width() * z.scaleX(),
			p = z.height() * z.scaleY(),
			G = S.x() - M / 2,
			L = S.y() - p / 2;
		T.x < G ||
			T.x > G + M ||
			T.y < L ||
			T.y > L + p ||
			(o(n, { x: (T.x - G) / M, y: (T.y - L) / p }, !0),
			g(),
			y.setToolbarControls({
				component: fa,
				props: { focalX: Math.round(t(n).x * 100), focalY: Math.round(t(n).y * 100), onReset: () => R(), onApply: () => N() }
			}));
	}
	function g() {
		const { imageNode: m, imageGroup: z } = y.state;
		if (!t(c) || !m || !z) return;
		const S = m.width() * m.scaleX(),
			T = m.height() * m.scaleY(),
			M = z.x() - S / 2,
			p = z.y() - T / 2,
			G = M + S * t(n).x,
			L = p + T * t(n).y;
		(t(c).position({ x: G, y: L }), t(s)?.batchDraw());
	}
	function R() {
		(o(n, { x: 0.5, y: 0.5 }, !0), g());
	}
	function N() {
		const { imageNode: m } = y.state;
		m && ((m.metadata = { ...m.metadata, focalPoint: { ...t(n) } }), y.takeSnapshot(), y.setActiveState(''));
	}
	function O() {
		try {
			u();
		} catch {}
	}
	function w() {}
	function k() {
		O();
	}
	var E = { cleanup: O, saveState: w, beforeExit: k };
	return ce(E);
}
const gr = { key: 'focalpoint', title: 'Focal', icon: 'mdi:target', tool: pr, controls: null },
	br = Object.freeze(Object.defineProperty({ __proto__: null, editorWidget: gr }, Symbol.toStringTag, { value: 'Module' }));
var yr = C(
	'<div class="flex w-full items-center gap-4"><span class="text-sm font-medium">Rotate & Flip Image</span> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <div class="flex items-center gap-2"><span class="text-sm">Rotate:</span> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Rotate Left 90°"><iconify-icon></iconify-icon></button> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Rotate Right 90°"><iconify-icon></iconify-icon></button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <label class="flex items-center gap-2 text-sm"><span>Angle:</span> <input type="range" min="-180" max="180" step="1" class="range range-primary w-32"/> <span class="w-12 text-right"> </span></label> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <div class="flex items-center gap-2"><span class="text-sm">Flip:</span> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Flip Horizontal"><iconify-icon></iconify-icon></button> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Flip Vertical"><iconify-icon></iconify-icon></button></div> <div class="grow"></div> <button class="btn preset-outlined-surface-500"><iconify-icon></iconify-icon> <span>Reset</span></button> <button class="btn preset-filled-success-500"><iconify-icon></iconify-icon> <span>Apply</span></button></div>',
	2
);
function ha(D, e) {
	le(e, !0);
	function n(p) {
		const G = p.currentTarget;
		e.onRotationChange(parseInt(G.value, 10));
	}
	const s = Pt(() => () => {
		let p = e.rotationAngle % 360;
		return (p > 180 && (p -= 360), p < -180 && (p += 360), Math.round(p));
	});
	var c = yr(),
		v = r(i(c), 4),
		b = r(i(v), 2);
	b.__click = function (...p) {
		e.onRotateLeft?.apply(this, p);
	};
	var u = i(b);
	(l(u, 'icon', 'mdi:rotate-left'), a(b));
	var d = r(b, 2);
	d.__click = function (...p) {
		e.onRotateRight?.apply(this, p);
	};
	var _ = i(d);
	(l(_, 'icon', 'mdi:rotate-right'), a(d), a(v));
	var f = r(v, 4),
		g = r(i(f), 2);
	(Kt(g), (g.__input = n));
	var R = r(g, 2),
		N = i(R);
	(a(R), a(f));
	var O = r(f, 4),
		w = r(i(O), 2);
	w.__click = function (...p) {
		e.onFlipHorizontal?.apply(this, p);
	};
	var k = i(w);
	(l(k, 'icon', 'mdi:flip-horizontal'), a(w));
	var E = r(w, 2);
	E.__click = function (...p) {
		e.onFlipVertical?.apply(this, p);
	};
	var m = i(E);
	(l(m, 'icon', 'mdi:flip-vertical'), a(E), a(O));
	var z = r(O, 4);
	z.__click = function (...p) {
		e.onReset?.apply(this, p);
	};
	var S = i(z);
	(l(S, 'icon', 'mdi:restore'), nt(2), a(z));
	var T = r(z, 2);
	T.__click = function (...p) {
		e.onApply?.apply(this, p);
	};
	var M = i(T);
	(l(M, 'icon', 'mdi:check'),
		nt(2),
		a(T),
		a(c),
		$(
			(p) => {
				(Ze(g, e.rotationAngle), at(N, `${p ?? ''}°`));
			},
			[() => t(s)()]
		),
		h(D, c),
		ce());
}
Ee(['click', 'input']);
function _r(D, e) {
	le(e, !0);
	let n = V(0);
	je(() => {
		if (y.state.activeState === 'rotate') {
			const { imageGroup: k } = y.state;
			(k && o(n, k.rotation(), !0),
				y.setToolbarControls({
					component: ha,
					props: {
						rotationAngle: t(n),
						onRotateLeft: s,
						onRotateRight: c,
						onRotationChange: v,
						onFlipHorizontal: b,
						onFlipVertical: u,
						onReset: d,
						onApply: _
					}
				}));
		} else y.state.toolbarControls?.component === ha && y.setToolbarControls(null);
	});
	function s() {
		const { imageGroup: w, layer: k } = y.state;
		if (!w || !k) return;
		const m = (w.rotation() - 90) % 360;
		(w.rotation(m), o(n, m), k.batchDraw());
	}
	function c() {
		const { imageGroup: w, layer: k } = y.state;
		if (!w || !k) return;
		const m = (w.rotation() + 90) % 360;
		(w.rotation(m), o(n, m), k.batchDraw());
	}
	function v(w) {
		const { imageGroup: k, layer: E } = y.state;
		!k || !E || (k.rotation(w), o(n, w, !0), E.batchDraw());
	}
	function b() {
		const { imageGroup: w, layer: k } = y.state;
		!w || !k || (w.scaleX(w.scaleX() * -1), k.batchDraw());
	}
	function u() {
		const { imageGroup: w, layer: k } = y.state;
		!w || !k || (w.scaleY(w.scaleY() * -1), k.batchDraw());
	}
	function d() {
		const { imageGroup: w, layer: k } = y.state;
		!w || !k || (w.rotation(0), w.scaleX(Math.abs(w.scaleX())), w.scaleY(Math.abs(w.scaleY())), o(n, 0), k.batchDraw());
	}
	function _() {
		(y.takeSnapshot(), y.setActiveState(''));
	}
	function f() {}
	function g() {}
	function R() {}
	var N = { cleanup: f, saveState: g, beforeExit: R };
	nt();
	var O =
		qe(`/** * @file shared/image-editor/src/widgets/Rotate/Tool.svelte * @component **Rotate tool for rotating and flipping images** ### Features: - Rotates
and flips images - Resets rotation and flips - Applies changes to the image */ // imageEditor/widgets/Rotate/Tool.svelte /** * @file
src/components/imageEditor/widgets/Rotate/Tool.svelte * @component * Rotate tool for rotating and flipping images */`);
	return (h(D, O), ce(N));
}
const xr = { key: 'rotate', title: 'Rotate', icon: 'mdi:rotate-right', tool: _r, controls: ha },
	Ia = xr,
	wr = Object.freeze(Object.defineProperty({ __proto__: null, default: Ia, editorWidget: Ia }, Symbol.toStringTag, { value: 'Module' }));
var kr = C('<button class="btn-sm"><iconify-icon></iconify-icon></button>', 2),
	Sr = C(
		'<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <span class="text-sm">Position:</span> <div class="btn-group preset-outlined-surface-500"></div> <div class="grow"></div> <button class="btn preset-outlined-error-500"><iconify-icon></iconify-icon> <span>Delete</span></button>',
		3
	),
	Tr = C(
		'<div class="flex w-full items-center gap-4"><button class="btn preset-outlined-surface-500"><iconify-icon></iconify-icon> <span>Add Watermark</span></button> <!></div>',
		2
	);
function Ea(D, e) {
	le(e, !0);
	const n = [
		{ value: 'top-left', icon: 'mdi:align-vertical-top' },
		{ value: 'top-center', icon: 'mdi:align-vertical-center' },
		{ value: 'top-right', icon: 'mdi:align-vertical-top' },
		{ value: 'center-left', icon: 'mdi:align-horizontal-left' },
		{ value: 'center', icon: 'mdi:align-horizontal-center' },
		{ value: 'center-right', icon: 'mdi:align-horizontal-right' },
		{ value: 'bottom-left', icon: 'mdi:align-vertical-bottom' },
		{ value: 'bottom-center', icon: 'mdi:align-vertical-center' },
		{ value: 'bottom-right', icon: 'mdi:align-vertical-bottom' }
	];
	var s = Tr(),
		c = i(s);
	c.__click = function (...d) {
		e.onAddWatermark?.apply(this, d);
	};
	var v = i(c);
	(l(v, 'icon', 'mdi:plus-box-outline'), nt(2), a(c));
	var b = r(c, 2);
	{
		var u = (d) => {
			var _ = Sr(),
				f = r(ct(_), 4);
			(Be(
				f,
				21,
				() => n,
				Ke,
				(N, O) => {
					var w = kr();
					w.__click = () => e.onPositionChange(t(O).value);
					var k = i(w);
					($(() => l(k, 'icon', t(O).icon)), a(w), $(() => ye(w, 'title', t(O).value)), h(N, w));
				}
			),
				a(f));
			var g = r(f, 4);
			g.__click = function (...N) {
				e.onDeleteWatermark?.apply(this, N);
			};
			var R = i(g);
			(l(R, 'icon', 'mdi:delete-outline'), nt(2), a(g), h(d, _));
		};
		K(b, (d) => {
			e.hasSelection && d(u);
		});
	}
	(a(s), h(D, s), ce());
}
Ee(['click']);
class Fa {
	id;
	node;
	layer;
	imageGroup;
	objectUrl = null;
	_onSelect = null;
	_onDestroy = null;
	constructor(e) {
		((this.id = e.id),
			(this.layer = e.layer),
			(this.imageGroup = e.imageGroup),
			(this.node = new it.Image({ image: void 0, draggable: !0, name: 'watermark' })),
			this.layer.add(this.node),
			this.node.zIndex(5),
			this.node.on('click tap', (n) => {
				((n.cancelBubble = !0), this._onSelect?.());
			}));
	}
	loadImage(e, n) {
		return new Promise((s, c) => {
			this.objectUrl = URL.createObjectURL(e);
			const v = new Image();
			((v.onload = () => {
				const b = (n.stageWidth * 0.2) / v.width,
					u = v.width * b,
					d = v.height * b,
					_ = n.stageWidth / 2 - u / 2,
					f = n.stageHeight / 2 - d / 2;
				(this.node.setAttrs({ image: v, x: _, y: f, width: u, height: d, opacity: n.opacity }), this.layer.batchDraw(), s());
			}),
				(v.onerror = (b) => {
					c(b);
				}),
				(v.src = this.objectUrl));
		});
	}
	setOpacity(e) {
		(this.node.opacity(e), this.layer.batchDraw());
	}
	snapTo(e) {
		const n = this.layer.getStage(),
			s = this.imageGroup.getClientRect(),
			c = this.node.getClientRect(),
			v = 10;
		let b, u;
		(e.startsWith('t') ? (u = s.y + v) : e.startsWith('c') ? (u = s.y + s.height / 2 - c.height / 2) : (u = s.y + s.height - c.height - v),
			e.endsWith('l') ? (b = s.x + v) : e.endsWith('c') ? (b = s.x + s.width / 2 - c.width / 2) : (b = s.x + s.width - c.width - v));
		const _ = n.getAbsoluteTransform().copy().invert().point({ x: b, y: u });
		(this.node.position(_), this.layer.batchDraw());
	}
	disableInteraction() {
		this.node.draggable(!1);
	}
	destroy() {
		(this.node.off('click tap'), this.node.destroy(), this.objectUrl && URL.revokeObjectURL(this.objectUrl), this._onDestroy?.());
	}
	onSelect(e) {
		this._onSelect = e;
	}
	onDestroy(e) {
		this._onDestroy = e;
	}
}
var Cr = C('<input type="file" accept="image/png, image/svg+xml" class="hidden"/>');
function Rr(D, e) {
	le(e, !0);
	let n = V(Me([])),
		s = V(null),
		c = V(null),
		v = V(0.8),
		b,
		u = V(!1),
		d = V(!1);
	const _ = Oa('watermarkPreset');
	je(() => {
		if (y.state.activeState === 'watermark') {
			f();
			const Y = _?.();
			(Y?.url && t(n).length === 0 && !t(d) && (o(d, !0), N(Y)),
				y.setToolbarControls({
					component: Ea,
					props: {
						hasSelection: !!t(s),
						onAddWatermark: () => b?.click(),
						onDeleteWatermark: () => E(),
						onPositionChange: (Q) => t(s)?.snapTo(Q),
						onApply: () => z()
					}
				}));
		} else (g(), o(d, !1), y.state.toolbarControls?.component === Ea && y.setToolbarControls(null));
	});
	function f() {
		const { stage: U, layer: Y } = y.state;
		!U || !Y || t(u) || (o(u, !0), t(c) || o(c, Ga(Y), !0), U.on('click.watermark tap.watermark', R), (U.container().style.cursor = 'default'));
	}
	function g() {
		const { stage: U } = y.state;
		!U || !t(u) || (o(u, !1), U.off('click.watermark tap.watermark'), U.container() && (U.container().style.cursor = 'default'), k());
	}
	function R(U) {
		U.target === U.target.getStage() && k();
	}
	async function N(U) {
		const { stage: Y, layer: Q, imageNode: dt, imageGroup: lt } = y.state;
		if (!(!Y || !Q || !dt || !lt))
			try {
				const X = await fetch(U.url);
				if (!X.ok) {
					console.warn('Failed to fetch preset watermark:', U.url);
					return;
				}
				const P = await X.blob(),
					H = U.url.split('/').pop() || 'preset-watermark.png',
					W = new File([P], H, { type: P.type || 'image/png' }),
					x = new Fa({ id: crypto.randomUUID(), layer: Q, imageGroup: lt });
				(x.onSelect(() => w(x)),
					x.onDestroy(() => {
						(o(
							n,
							t(n).filter((q) => q.id !== x.id),
							!0
						),
							t(s)?.id === x.id && k());
					}),
					o(n, [...t(n), x], !0),
					w(x));
				const B = typeof U.scale == 'number' && U.scale > 1 ? U.scale / 100 : (U.scale ?? 0.8);
				(await x.loadImage(W, { opacity: B, stageWidth: Y.width(), stageHeight: Y.height() }),
					U.position && x.snapTo(U.position),
					aa(t(c), x.node),
					Q.batchDraw());
			} catch (X) {
				console.error('Failed to load preset watermark', X);
			}
	}
	async function O(U) {
		const { stage: Y, layer: Q, imageNode: dt, imageGroup: lt } = y.state;
		if (!Y || !Q || !dt || !lt) return;
		const X = new Fa({ id: crypto.randomUUID(), layer: Q, imageGroup: lt });
		(X.onSelect(() => w(X)),
			X.onDestroy(() => {
				(o(
					n,
					t(n).filter((P) => P.id !== X.id),
					!0
				),
					t(s)?.id === X.id && k());
			}),
			o(n, [...t(n), X], !0),
			w(X));
		try {
			(await X.loadImage(U, { opacity: t(v), stageWidth: Y.width(), stageHeight: Y.height() }), aa(t(c), X.node), Q.batchDraw());
		} catch (P) {
			(console.error('Failed to load watermark image', P), X.destroy());
		}
	}
	function w(U) {
		(o(s, U, !0), t(c) && (aa(t(c), U.node), o(v, U.node.opacity(), !0)));
	}
	function k() {
		(o(s, null), t(c) && aa(t(c), null));
	}
	function E() {
		t(s) && t(s).destroy();
	}
	function m(U = !0) {
		(k(), U ? ([...t(n)].forEach((Y) => Y.destroy()), o(n, [], !0)) : t(n).forEach((Y) => Y.disableInteraction()), y.state.layer?.batchDraw());
	}
	function z() {
		(y.takeSnapshot(), y.setActiveState(''));
	}
	function S(U) {
		const Y = U.target;
		(Y.files && Y.files.length > 0 && O(Y.files[0]), (Y.value = ''));
	}
	function T() {
		try {
			(g(), m(!0), t(c)?.destroy(), o(c, null));
		} catch {}
	}
	function M() {}
	function p() {
		T();
	}
	var G = { cleanup: T, saveState: M, beforeExit: p },
		L = Cr();
	return (
		(L.__change = S),
		ca(
			L,
			(U) => (b = U),
			() => b
		),
		h(D, L),
		ce(G)
	);
}
Ee(['change']);
const Ar = { key: 'watermark', title: 'Watermark', icon: 'mdi:copyright', tool: Rr },
	Dr = Object.freeze(Object.defineProperty({ __proto__: null, default: Ar }, Symbol.toStringTag, { value: 'Module' })),
	Ir = Object.assign({
		'./Annotate/index.ts': Kn,
		'./Blur/index.ts': er,
		'./Crop/index.ts': sr,
		'./FineTune/index.ts': hr,
		'./FocalPoint/index.ts': br,
		'./Rotate/index.ts': wr,
		'./Watermark/index.ts': Dr
	}),
	pa = Object.values(Ir)
		.map((D) => {
			const e = D;
			return e.default ?? e.editorWidget;
		})
		.filter((D) => !!D);
var Er = C('<div class="text-[10px] text-surface-300"> </div>'),
	Fr = C(
		'<button><div class="tool-icon flex items-center justify-center"><iconify-icon></iconify-icon></div> <span class="tool-label text-[10px] font-medium leading-none lg:text-xs"> </span> <div class="tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-surface-700 shadow-lg"><div class="font-medium"> </div> <!> <div class="absolute -left-1 top-1/2 -mt-1 h-2 w-2 -rotate-45 bg-surface-900 dark:bg-surface-700"></div></div></button>',
		2
	),
	Pr = C(
		'<div class="no-image-hint flex flex-col items-center gap-1 p-2 text-center"><iconify-icon></iconify-icon> <span class="text-xs text-surface-500 dark:text-surface-50">Upload an image to enable tools</span></div>',
		2
	),
	zr = C(
		'<div class="editor-sidebar flex w-20 flex-col border-r lg:w-24 svelte-tmcsbf"><div class="sidebar-tools flex flex-1 flex-col gap-1 p-1.5 lg:p-2 max-lg:gap-0.5 max-lg:p-1"></div> <div class="sidebar-footer border-t p-2 svelte-tmcsbf"><!></div></div>'
	);
function Mr(D, e) {
	le(e, !0);
	const n = Tt(e, 'hasImage', 3, !1),
		s = [...pa.map((g) => ({ id: g.key, name: g.title, icon: g.icon ?? 'mdi:cog', description: '' }))];
	function c(g) {
		n() && e.onToolSelect(g.id);
	}
	function v(g) {
		return e.activeState === g.id;
	}
	var b = zr(),
		u = i(b);
	(Be(
		u,
		21,
		() => s,
		Ke,
		(g, R) => {
			var N = Fr();
			let O;
			N.__click = () => c(t(R));
			var w = i(N),
				k = i(w);
			($(() => l(k, 'icon', t(R).icon)), l(k, 'width', '24'), a(w));
			var E = r(w, 2),
				m = i(E, !0);
			a(E);
			var z = r(E, 2),
				S = i(z),
				T = i(S, !0);
			a(S);
			var M = r(S, 2);
			{
				var p = (G) => {
					var L = Er(),
						U = i(L, !0);
					(a(L), $(() => at(U, t(R).description)), h(G, L));
				};
				K(M, (G) => {
					t(R).description && G(p);
				});
			}
			(nt(2),
				a(z),
				a(N),
				$(
					(G) => {
						((O = wt(N, 1, 'btn preset-filled-primary-500 group relative flex flex-col items-center justify-center gap-1 py-2', null, O, G)),
							ye(N, 'aria-label', t(R).name),
							(N.disabled = !n()),
							at(m, t(R).name),
							at(T, t(R).name));
					},
					[
						() => ({
							active: v(t(R)),
							disabled: !n(),
							'bg-primary-500': v(t(R)),
							'text-white': v(t(R)),
							'shadow-md': v(t(R)),
							'hover:bg-primary-600': v(t(R)),
							'cursor-not-allowed': !n(),
							'opacity-50': !n(),
							'bg-transparent': !n()
						})
					]
				),
				h(g, N));
		}
	),
		a(u));
	var d = r(u, 2),
		_ = i(d);
	{
		var f = (g) => {
			var R = Pr(),
				N = i(R);
			(l(N, 'icon', 'mdi:information-outline'), l(N, 'width', '16'), wt(N, 1, 'text-surface-400'), nt(2), a(R), h(g, R));
		};
		K(_, (g) => {
			n() || g(f);
		});
	}
	(a(d), a(b), h(D, b), ce());
}
Ee(['click']);
var Nr = C(
		'<div class="empty-state pointer-events-none absolute inset-0 z-10 flex items-center justify-center svelte-1mk2cuv"><div class="empty-state-content flex max-w-md flex-col items-center gap-6 p-8 text-center max-md:p-6"><div class="empty-icon flex h-20 w-20 items-center justify-center rounded-full bg-surface-200 ring-4 ring-surface-300 dark:bg-surface-700 dark:ring-surface-600 max-md:h-16 max-md:w-16"><iconify-icon></iconify-icon></div> <div class="empty-text"><h3 class="mb-2 text-lg font-medium text-surface-700 dark:text-surface-300 max-md:text-base">No Image Selected</h3> <p class="text-sm text-surface-500 dark:text-surface-50 max-md:text-xs">Upload an image to start editing</p></div> <div class="empty-hints flex flex-col gap-2"><div class="hint-item flex items-center justify-center gap-2"><iconify-icon></iconify-icon> <span class="text-xs text-surface-500 dark:text-surface-50 max-md:text-[10px]">Drag & drop supported</span></div> <div class="hint-item flex items-center justify-center gap-2"><iconify-icon></iconify-icon> <span class="text-xs text-surface-500 dark:text-surface-50 max-md:text-[10px]">PNG, JPG, WebP, GIF</span></div></div></div></div>',
		2
	),
	jr = C(
		'<div class="loading-overlay absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-50/80 backdrop-blur-sm dark:bg-surface-900/80 z-20"><div class="loading-spinner flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg dark:bg-surface-800"><iconify-icon></iconify-icon></div> <span class="text-sm text-surface-600 dark:text-surface-300"> </span></div>',
		2
	),
	Gr = C(
		'<div class="editor-canvas-wrapper relative flex-1 overflow-hidden rounded-lg border border-surface-200 transition-all duration-300 ease-in-out focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-surface-50 dark:focus-within:ring-offset-surface-900 md:rounded-lg md:border md:border-surface-200 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-t svelte-1mk2cuv"><div class="canvas-container h-full w-full transition-all duration-300 ease-in-out svelte-1mk2cuv"></div> <!> <!> <!></div>'
	);
function Ur(D, e) {
	le(e, !0);
	let n = Tt(e, 'hasImage', 3, !1),
		s = Tt(e, 'isLoading', 3, !1),
		c = Tt(e, 'loadingMessage', 3, 'Loading...'),
		v = Tt(e, 'containerRef', 15),
		b = V(!1);
	je(() => {
		o(b, !0);
	});
	var u = Gr(),
		d = i(u);
	ca(
		d,
		(O) => v(O),
		() => v()
	);
	var _ = r(d, 2);
	{
		var f = (O) => {
			var w = Nr(),
				k = i(w),
				E = i(k),
				m = i(E);
			(l(m, 'icon', 'mdi:image-plus'), l(m, 'width', '48'), wt(m, 1, 'text-surface-400 dark:text-surface-500'), a(E));
			var z = r(E, 4),
				S = i(z),
				T = i(S);
			(l(T, 'icon', 'mdi:gesture-tap'), l(T, 'width', '16'), wt(T, 1, 'text-surface-400'), nt(2), a(S));
			var M = r(S, 2),
				p = i(M);
			(l(p, 'icon', 'mdi:file-image'), l(p, 'width', '16'), wt(p, 1, 'text-surface-400'), nt(2), a(M), a(z), a(k), a(w), h(O, w));
		};
		K(_, (O) => {
			n() || O(f);
		});
	}
	var g = r(_, 2);
	ei(g, () => e.children ?? La);
	var R = r(g, 2);
	{
		var N = (O) => {
			var w = jr(),
				k = i(w),
				E = i(k);
			(l(E, 'icon', 'mdi:loading'), l(E, 'width', '32'), wt(E, 1, 'animate-spin text-primary-500'), a(k));
			var m = r(k, 2),
				z = i(m, !0);
			(a(m),
				a(w),
				$(() => at(z, c())),
				la(
					3,
					w,
					() => za,
					() => ({ duration: 200 })
				),
				h(O, w));
		};
		K(R, (O) => {
			((n() && !t(b)) || s()) && O(N);
		});
	}
	(a(u), h(D, u), ce());
}
var Or = C(
		'<div class="error-banner bg-error-50 border-l-4 border-error-500 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert"><div class="flex items-center gap-2"><iconify-icon></iconify-icon> <span> </span> <button class="ml-auto text-error-600 hover:text-error-800" aria-label="Dismiss error"><iconify-icon></iconify-icon></button></div></div>',
		2
	),
	Lr = C(
		'<div class="image-editor flex h-full w-full flex-col overflow-hidden" role="application" aria-label="Image editor"><!> <div class="editor-layout flex h-full overflow-hidden"><!> <div class="editor-main flex min-w-0 flex-1 flex-col"><div class="canvas-wrapper relative flex flex-1 flex-col"><!></div></div></div></div>'
	);
function Wr(D, e) {
	le(e, !0);
	const n = Tt(e, 'imageFile', 3, null),
		s = Tt(e, 'initialImageSrc', 3, ''),
		c = Tt(e, 'onsave', 3, () => {}),
		v = Tt(e, 'oncancel', 3, () => {});
	let b = V(''),
		u = V(void 0),
		d = V(!1),
		_ = V(!1),
		f = V(null),
		g = V(null);
	const R = y.state,
		N = Pt(() => y.state.activeState),
		O = Pt(() => !!R.imageNode),
		w = Pt(() => {
			if (!t(N)) return null;
			const x = pa.find((B) => B.key === t(N));
			return x?.tool ? x.tool : (t(N) === 'focalpoint' || qt.warn(`Tool not found for state: ${t(N)}`), null);
		});
	(je(() => () => {
		t(b) && t(b).startsWith('blob:') && URL.revokeObjectURL(t(b));
	}),
		je(() => {
			t(u) &&
				!t(d) &&
				(s() || n()) &&
				(s()
					? (qt.debug('Loading initial image from src:', s()), o(b, s()), k(t(b)))
					: n() && (qt.debug('Loading initial image from file'), o(b, URL.createObjectURL(n()), !0), k(t(b), n())),
				o(d, !0));
		}));
	function k(x, B) {
		if (!t(u)) {
			(qt.error('Container ref not available'), o(f, 'Container not ready'));
			return;
		}
		(o(_, !0), o(f, null));
		const q = new Image();
		try {
			const rt = window.location.origin;
			new URL(x, rt).origin !== rt && (q.crossOrigin = 'anonymous');
		} catch {
			q.crossOrigin = 'anonymous';
		}
		((q.onerror = () => {
			(o(f, 'Failed to load image'), o(_, !1), qt.error('Image load error'));
		}),
			(q.onload = () => {
				try {
					const rt = t(u).clientWidth,
						kt = t(u).clientHeight,
						ft = y.state.stage;
					ft && ft.destroy();
					const zt = new it.Stage({ container: t(u), width: rt, height: kt }),
						pt = new it.Layer();
					zt.add(pt);
					const Ft = (rt * 0.8) / q.width,
						J = (kt * 0.8) / q.height,
						vt = Math.min(Ft, J),
						At = new it.Image({ image: q, width: q.width, height: q.height, x: -q.width / 2, y: -q.height / 2 }),
						Ct = new it.Group({ x: rt / 2, y: kt / 2, scaleX: vt, scaleY: vt });
					(Ct.add(At),
						pt.add(Ct),
						pt.draw(),
						y.setStage(zt),
						y.setLayer(pt),
						y.setImageNode(At),
						y.setImageGroup(Ct),
						B && y.setFile(B),
						y.takeSnapshot(),
						o(_, !1));
				} catch (rt) {
					(o(f, 'Failed to setup editor'), o(_, !1), qt.error('Konva setup error:', rt));
				}
			}),
			(q.src = x));
	}
	function E() {
		const { stage: x, imageGroup: B } = y.state;
		if (!x || !t(u)) return;
		const q = t(u).clientWidth,
			rt = t(u).clientHeight;
		(x.width(q), x.height(rt), B && B.position({ x: q / 2, y: rt / 2 }), x.batchDraw());
	}
	function m(x) {
		const B = x.target;
		if (B.tagName === 'INPUT' || B.tagName === 'TEXTAREA' || B.contentEditable === 'true') return;
		const rt = x.metaKey || x.ctrlKey,
			kt = x.shiftKey;
		if (x.key === 'Escape') {
			const ft = y.state.activeState;
			ft && (y.saveToolState(), y.cleanupToolSpecific(ft), y.setActiveState(''));
			return;
		}
		if (rt && !kt && x.key === 'z') {
			(x.preventDefault(), z());
			return;
		}
		if (rt && kt && x.key === 'z') {
			(x.preventDefault(), S());
			return;
		}
		if (x.key === 'Delete') {
			const ft = y.state.activeState;
			(ft === 'textoverlay' || ft === 'shapeoverlay') && document.querySelector('.preset-filled-error-500.btn')?.click();
		}
	}
	function z() {
		if (!y.canUndoState) return;
		const x = y.state.activeState;
		x && (y.cleanupToolSpecific(x), y.setActiveState(''));
		const B = y.undoState();
		B && T(B);
	}
	function S() {
		if (!y.canRedoState) return;
		const x = y.state.activeState;
		x && (y.cleanupToolSpecific(x), y.setActiveState(''));
		const B = y.redoState();
		B && T(B);
	}
	function T(x) {
		const { stage: B, layer: q, imageNode: rt, imageGroup: kt } = y.state;
		if (!(!B || !q || !rt || !kt))
			try {
				y.cleanupTempNodes();
				const ft = JSON.parse(x),
					zt = ft.stage && ft.activeState !== void 0,
					pt = zt ? JSON.parse(ft.stage) : ft;
				(zt && y.setActiveState(ft.activeState), rt.filters([]), rt.clearCache());
				const Ft = (vt) => {
						for (const At of vt) {
							if (At.className === 'Group' && At.children?.some((Ct) => Ct.className === 'Image')) return At;
							if (At.children) {
								const Ct = Ft(At.children);
								if (Ct) return Ct;
							}
						}
						return null;
					},
					J = Ft(pt.children || []);
				if (J && J.attrs) {
					kt.setAttrs({
						x: J.attrs.x ?? B.width() / 2,
						y: J.attrs.y ?? B.height() / 2,
						scaleX: J.attrs.scaleX ?? 1,
						scaleY: J.attrs.scaleY ?? 1,
						rotation: J.attrs.rotation ?? 0
					});
					const vt = J.children.find((At) => At.className === 'Image');
					if (
						vt &&
						vt.attrs &&
						(rt.setAttrs({
							cropX: vt.attrs.cropX,
							cropY: vt.attrs.cropY,
							cropWidth: vt.attrs.cropWidth,
							cropHeight: vt.attrs.cropHeight,
							width: vt.attrs.width,
							height: vt.attrs.height,
							x: vt.attrs.x,
							y: vt.attrs.y,
							cornerRadius: vt.attrs.cornerRadius ?? 0
						}),
						vt.attrs.filters?.length > 0)
					) {
						const At = [];
						(vt.attrs.brightness !== void 0 && At.push(it.Filters.Brighten),
							vt.attrs.contrast !== void 0 && At.push(it.Filters.Contrast),
							(vt.attrs.saturation !== void 0 || vt.attrs.luminance !== void 0) && At.push(it.Filters.HSL),
							rt.filters(At),
							rt.setAttrs(vt.attrs),
							rt.cache());
					}
				}
				(q.batchDraw(), B.batchDraw());
			} catch (ft) {
				(qt.error('Failed to restore state:', ft), o(f, 'Failed to restore state'));
			}
	}
	async function M() {
		const { stage: x, file: B } = y.state;
		if (!x || !B) {
			o(f, 'Nothing to save');
			return;
		}
		(o(_, !0), o(f, null));
		try {
			y.hideAllUI();
			let q, rt, kt;
			try {
				if (((q = x.toDataURL({ mimeType: 'image/avif', quality: 0.85, pixelRatio: 1 })), q.startsWith('data:image/avif')))
					((rt = 'image/avif'), (kt = 'avif'), qt.debug('Using AVIF format'));
				else throw new Error('AVIF not supported');
			} catch {
				(qt.warn('AVIF not supported, using WebP'),
					(q = x.toDataURL({ mimeType: 'image/webp', quality: 0.95, pixelRatio: 1 })),
					(rt = 'image/webp'),
					(kt = 'webp'));
			}
			const zt = await (await fetch(q)).blob(),
				Ft = `edited-${new Date().toISOString().replace(/[:.]/g, '-')}.${kt}`,
				J = new File([zt], Ft, { type: rt });
			c()({ dataURL: q, file: J });
		} catch (q) {
			(qt.error('Save error:', q), o(f, 'Failed to save image'));
		} finally {
			o(_, !1);
		}
	}
	function p() {
		v()();
	}
	function G(x) {
		const B = y.state.activeState;
		if (B && B !== x) {
			(y.saveToolState(), y.cleanupToolSpecific(B));
			const { stage: rt, imageGroup: kt } = y.state;
			if (rt && kt) {
				const ft = rt.width() / 2,
					zt = rt.height() / 2,
					pt = kt.x(),
					Ft = kt.y();
				(Math.abs(pt - ft) > 5 || Math.abs(Ft - zt) > 5) && kt.position({ x: ft, y: zt });
			}
		}
		const q = B === x ? '' : x;
		(q !== '' && q !== B && o(g, y.undoState(!0), !0), y.setActiveState(q), q === '' && (y.setToolbarControls(null), o(g, null)));
	}
	function L() {
		const x = y.state.activeState;
		x && (t(g) && T(t(g)), y.cleanupToolSpecific(x), y.setActiveState(''), y.setToolbarControls(null), o(g, null));
	}
	(Ma(
		() => (
			y.reset(),
			window.addEventListener('resize', E),
			window.addEventListener('keydown', m),
			() => {
				(window.removeEventListener('resize', E), window.removeEventListener('keydown', m), y.cleanupTempNodes(), y.reset());
			}
		)
	),
		Qa(() => {
			t(b) && t(b).startsWith('blob:') && URL.revokeObjectURL(t(b));
		}));
	var U = { handleUndo: z, handleRedo: S, handleSave: M, handleCancel: p, handleCancelTool: L },
		Y = Lr(),
		Q = i(Y);
	{
		var dt = (x) => {
			var B = Or(),
				q = i(B),
				rt = i(q);
			(l(rt, 'icon', 'mdi:alert-circle'), l(rt, 'width', '20'));
			var kt = r(rt, 2),
				ft = i(kt, !0);
			a(kt);
			var zt = r(kt, 2);
			zt.__click = () => o(f, null);
			var pt = i(zt);
			(l(pt, 'icon', 'mdi:close'), l(pt, 'width', '18'), a(zt), a(q), a(B), $(() => at(ft, t(f))), h(x, B));
		};
		K(Q, (x) => {
			t(f) && x(dt);
		});
	}
	var lt = r(Q, 2),
		X = i(lt);
	{
		let x = Pt(() => t(N) ?? '');
		Mr(X, {
			get activeState() {
				return t(x);
			},
			onToolSelect: G,
			get hasImage() {
				return t(O);
			}
		});
	}
	var P = r(X, 2),
		H = i(P),
		W = i(H);
	return (
		Ur(W, {
			get hasImage() {
				return t(O);
			},
			get containerRef() {
				return t(u);
			},
			set containerRef(x) {
				o(u, x, !0);
			},
			children: (x, B) => {
				var q = Zt(),
					rt = ct(q);
				{
					var kt = (ft) => {
						var zt = Zt(),
							pt = ct(zt);
						{
							var Ft = (J) => {
								const vt = Pt(() => t(w));
								var At = Zt(),
									Ct = ct(At);
								(be(
									Ct,
									() => t(vt),
									(Nt, ve) => {
										ve(Nt, { onCancel: L });
									}
								),
									h(J, At));
							};
							K(pt, (J) => {
								t(w) && J(Ft);
							});
						}
						h(ft, zt);
					};
					K(rt, (ft) => {
						R.stage && R.layer && R.imageNode && R.imageGroup && ft(kt);
					});
				}
				h(x, q);
			},
			$$slots: { default: !0 }
		}),
		a(H),
		a(P),
		a(lt),
		a(Y),
		$(() => ye(Y, 'aria-busy', t(_))),
		h(D, Y),
		ce(U)
	);
}
Ee(['click']);
var Br = C(
		'<div class="absolute bottom-full left-0 right-0 flex items-center justify-center bg-error-500 py-1 text-xs font-medium text-white"><iconify-icon></iconify-icon> </div>',
		2
	),
	Hr = C(
		'<div class="border-t border-surface-300 bg-surface-100 p-2 shadow-lg dark:text-surface-50 dark:bg-surface-800 svelte-w4hoxq"><div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4"><div class="flex h-full flex-1 items-center gap-3"><!></div></div> <!></div>'
	);
function Xr(D, e) {
	le(e, !0);
	const n = Pt(() => y.state.toolbarControls);
	var s = Hr(),
		c = i(s),
		v = i(c),
		b = i(v);
	{
		var u = (f) => {
			const g = Pt(() => t(n).component);
			var R = Zt(),
				N = ct(R);
			{
				var O = (w) => {
					var k = Zt(),
						E = ct(k);
					(be(
						E,
						() => t(g),
						(m, z) => {
							z(
								m,
								Ya(() => t(n).props)
							);
						}
					),
						h(w, k));
				};
				K(N, (w) => {
					t(g) && w(O);
				});
			}
			h(f, R);
		};
		K(b, (f) => {
			t(n)?.component && f(u);
		});
	}
	(a(v), a(c));
	var d = r(c, 2);
	{
		var _ = (f) => {
			var g = Br(),
				R = i(g);
			(l(R, 'icon', 'mdi:alert-circle'), l(R, 'width', '14'), wt(R, 1, 'mr-1'));
			var N = r(R);
			(a(g),
				$(() => at(N, ` ${y.state.error ?? ''}`)),
				la(
					3,
					g,
					() => za,
					() => ({ duration: 200 })
				),
				h(f, g));
		};
		K(d, (f) => {
			y.state.error && f(_);
		});
	}
	(a(s), h(D, s), ce());
}
var Vr = C('<iconify-icon></iconify-icon>', 2),
	Yr = C(
		'<span class="max-sm:hidden text-surface-400">:</span> <span class="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-extrabold"><!> <span> </span></span>',
		1
	),
	Jr = C('<span class="sm:hidden"> </span>'),
	qr = C(
		'<div class="flex items-center gap-2 text-primary-500 shrink-0"><iconify-icon></iconify-icon></div> <div class="flex flex-col min-w-0"><h2 id="image-editor-title" class="text-sm lg:text-lg font-bold truncate leading-tight flex items-center gap-1.5"><span class="max-sm:hidden"> </span> <!></h2></div>',
		3
	),
	Kr = C('<h2 id="image-editor-title" class="text-tertiary-500 dark:text-primary-400 text-lg font-semibold shrink-0">Image Editor</h2>'),
	Zr = C(
		'<div class="relative flex h-full min-h-[500px] w-full flex-col overflow-hidden bg-surface-100 shadow-xl dark:bg-surface-800"><header class="flex items-center justify-between border-b border-surface-300 p-3 lg:p-4 dark:text-surface-50 bg-surface-100/80 dark:bg-surface-800/80 sticky top-0 z-10"><div class="flex items-center gap-3 overflow-hidden"><!></div> <div class="flex items-center gap-2"><button class="btn-icon preset-outlined-surface-500" title="Undo (Ctrl+Z)" aria-label="Undo"><iconify-icon></iconify-icon></button> <button class="btn-icon preset-outlined-surface-500" title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><iconify-icon></iconify-icon></button> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <button class="btn preset-outlined-surface-500"> </button> <button class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500"><iconify-icon></iconify-icon> <span>Save</span></button> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <button class="btn-icon preset-outlined-surface-500" aria-label="Close"><iconify-icon></iconify-icon></button></div></header> <main class="flex-1 overflow-auto bg-surface-50/50 dark:bg-surface-900/50"><!></main> <!></div>',
		2
	);
function Qr(D, e) {
	le(e, !0);
	let n = Tt(e, 'image', 3, null),
		s = Tt(e, 'watermarkPreset', 3, null),
		c = Tt(e, 'onsave', 3, () => {}),
		v = Tt(e, 'close', 3, () => {});
	Wa('watermarkPreset', () => s());
	let b = V(void 0);
	const u = Pt(() => y.state.activeState),
		d = Pt(() => pa.find((w) => w.key === t(u))),
		_ = Pt(() => {
			if (t(u) === 'finetune') {
				const w = y.state.toolbarControls?.props;
				if (w?.activeAdjustment) {
					const k = w.activeAdjustment;
					return { label: k.charAt(0).toUpperCase() + k.slice(1), icon: w.activeIcon };
				}
			}
			return null;
		});
	function f() {
		(y.canUndoState && !confirm('You have unsaved changes. Are you sure you want to close?')) || v()();
	}
	function g() {
		if (t(u)) (y.cleanupToolSpecific(t(u)), y.setActiveState(''));
		else {
			if (y.canUndoState && !confirm('You have unsaved changes. Are you sure you want to discard them?')) return;
			f();
		}
	}
	var R = Zt(),
		N = ct(R);
	{
		var O = (w) => {
			var k = Zr(),
				E = i(k),
				m = i(E),
				z = i(m);
			{
				var S = (B) => {
						var q = qr(),
							rt = ct(q),
							kt = i(rt);
						($(() => l(kt, 'icon', t(d).icon)), l(kt, 'width', '24'), wt(kt, 1, 'max-sm:width-[20px]'), a(rt));
						var ft = r(rt, 2),
							zt = i(ft),
							pt = i(zt),
							Ft = i(pt, !0);
						a(pt);
						var J = r(pt, 2);
						{
							var vt = (Ct) => {
									var Nt = Yr(),
										ve = r(ct(Nt), 2),
										Ae = i(ve);
									{
										var we = (ke) => {
											var Z = Vr();
											($(() => l(Z, 'icon', t(_).icon)), l(Z, 'width', '16'), wt(Z, 1, 'lg:width-[20px]'), h(ke, Z));
										};
										K(Ae, (ke) => {
											t(_).icon && ke(we);
										});
									}
									var _e = r(Ae, 2),
										Fe = i(_e, !0);
									(a(_e), a(ve), $(() => at(Fe, t(_).label)), h(Ct, Nt));
								},
								At = (Ct) => {
									var Nt = Jr(),
										ve = i(Nt, !0);
									(a(Nt), $(() => at(ve, t(d).title)), h(Ct, Nt));
								};
							K(J, (Ct) => {
								t(_) ? Ct(vt) : Ct(At, !1);
							});
						}
						(a(zt), a(ft), $(() => at(Ft, t(d).title)), h(B, q));
					},
					T = (B) => {
						var q = Kr();
						h(B, q);
					};
				K(z, (B) => {
					t(d) ? B(S) : B(T, !1);
				});
			}
			a(m);
			var M = r(m, 2),
				p = i(M);
			p.__click = () => t(b)?.handleUndo();
			var G = i(p);
			(l(G, 'icon', 'mdi:undo'), l(G, 'width', '20'), a(p));
			var L = r(p, 2);
			L.__click = () => t(b)?.handleRedo();
			var U = i(L);
			(l(U, 'icon', 'mdi:redo'), l(U, 'width', '20'), a(L));
			var Y = r(L, 4);
			Y.__click = g;
			var Q = i(Y, !0);
			a(Y);
			var dt = r(Y, 2);
			dt.__click = () => t(b)?.handleSave();
			var lt = i(dt);
			(l(lt, 'icon', 'mdi:content-save'), l(lt, 'width', '18'), nt(2), a(dt));
			var X = r(dt, 4);
			X.__click = f;
			var P = i(X);
			(l(P, 'icon', 'mdi:close'), l(P, 'width', '24'), a(X), a(M), a(E));
			var H = r(E, 2),
				W = i(H);
			{
				let B = Pt(() => n()?.metadata?.focalPoint);
				ca(
					Wr(W, {
						get initialImageSrc() {
							return n().url;
						},
						get focalPoint() {
							return t(B);
						},
						onsave: (q) => c()(q),
						oncancel: f
					}),
					(q) => o(b, q, !0),
					() => t(b)
				);
			}
			a(H);
			var x = r(H, 2);
			(Xr(x, {}),
				a(k),
				$(() => {
					((p.disabled = !y.canUndoState), (L.disabled = !y.canRedoState), at(Q, t(u) ? 'Exit Tool' : 'Cancel'));
				}),
				h(w, k));
		};
		K(N, (w) => {
			n() && w(O);
		});
	}
	(h(D, R), ce());
}
Ee(['click']);
var $r = C('<article class="text-sm opacity-80"><!></article>'),
	to = C(
		'<div class="space-y-4"><!> <form class="flex flex-col gap-2"><input class="input p-2 border rounded-container-token bg-surface-200-800"/></form> <div class="flex justify-end gap-2 pt-2"><button type="button" class="btn preset-tonal">Cancel</button> <button type="button" class="btn preset-filled-primary">Confirm</button></div></div>'
	);
function eo(D, e) {
	le(e, !0);
	let n = Tt(e, 'body', 3, ''),
		s = Tt(e, 'value', 3, ''),
		c = Tt(e, 'type', 3, 'text'),
		v = V(Me(s()));
	function b() {
		e.close?.(t(v));
	}
	function u() {
		e.close?.(null);
	}
	var d = to(),
		_ = i(d);
	{
		var f = (k) => {
			var E = $r(),
				m = i(E);
			(ai(m, n), a(E), h(k, E));
		};
		K(_, (k) => {
			n() && k(f);
		});
	}
	var g = r(_, 2),
		R = i(g);
	(Kt(R), a(g));
	var N = r(g, 2),
		O = i(N);
	O.__click = u;
	var w = r(O, 2);
	((w.__click = b),
		a(N),
		a(d),
		$(() => ye(R, 'type', c())),
		Ve('submit', g, (k) => {
			(k.preventDefault(), b());
		}),
		Re(
			R,
			() => t(v),
			(k) => o(v, k)
		),
		h(D, d),
		ce());
}
Ee(['click']);
function ao(D, e) {
	return D?.url
		? va.MEDIASERVER_URL
			? `${va.MEDIASERVER_URL.replace(/\/+$/, '')}/${D.url}`
			: e && 'thumbnails' in D && D.thumbnails?.[e]?.url
				? D.thumbnails[e].url
				: `/files/${D.url}`
		: '';
}
var io = C('<span class="loading loading-spinner loading-xs"></span>'),
	no = C('<button aria-label="Clear search" class="preset-filled-surface-500 w-12"><iconify-icon></iconify-icon></button>', 2),
	ro = C('<option> </option>'),
	oo = C(
		'<button aria-label="Table" class="btn flex flex-col items-center justify-center px-1"><p class="text-center text-xs">Display</p> <iconify-icon></iconify-icon> <p class="text-xs">Table</p></button>',
		2
	),
	so = C(
		'<button aria-label="Grid" class="btn flex flex-col items-center justify-center px-1"><p class="text-center text-xs">Display</p> <iconify-icon></iconify-icon> <p class="text-center text-xs">Grid</p></button>',
		2
	),
	lo = C('<button type="button" aria-label="Tiny" class="px-1"><iconify-icon></iconify-icon> <p class="text-xs">Tiny</p></button>', 2),
	co = C('<button type="button" aria-label="Small" class="px-1"><iconify-icon></iconify-icon> <p class="text-xs">Small</p></button>', 2),
	uo = C('<button type="button" aria-label="Medium" class="px-1"><iconify-icon></iconify-icon> <p class="text-xs">Medium</p></button>', 2),
	fo = C('<button type="button" aria-label="Large" class="px-1"><iconify-icon></iconify-icon> <p class="text-xs">Large</p></button>', 2),
	vo = C('<button class="preset-filled-surface-500 w-12" aria-label="Clear search"><iconify-icon></iconify-icon></button>', 2),
	ho = C('<option> </option>'),
	mo = C(
		'<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Tiny - Click for Small" title="Tiny (Click to change)"><iconify-icon></iconify-icon> <span class="text-[10px] hidden xl:inline">Tiny</span></button>',
		2
	),
	po = C(
		'<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Small - Click for Medium" title="Small (Click to change)"><iconify-icon></iconify-icon> <span class="text-[10px] hidden xl:inline">Small</span></button>',
		2
	),
	go = C(
		'<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Medium - Click for Large" title="Medium (Click to change)"><iconify-icon></iconify-icon> <span class="text-[10px] hidden xl:inline">Medium</span></button>',
		2
	),
	bo = C(
		'<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Large - Click for Tiny" title="Large (Click to change)"><iconify-icon></iconify-icon> <span class="text-[10px] hidden xl:inline">Large</span></button>',
		2
	),
	yo = C('<!> <div class="alert preset-outline-surface-500 mt-4"><iconify-icon></iconify-icon> <span class="text-sm"> </span></div>', 3),
	_o = C(
		'<div class="alert preset-filled-warning-500 fixed bottom-4 right-4 z-40 max-w-sm"><iconify-icon></iconify-icon> <div class="flex-1"><p class="font-semibold">Advanced search active</p> <p class="text-sm opacity-90">Showing filtered results</p></div> <button class="preset-outline-surface-500 btn-icon btn-sm" aria-label="Clear search"><iconify-icon></iconify-icon></button></div>',
		2
	),
	xo = C(
		'<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><!> <div class="lgd:mt-0 flex items-center justify-center gap-4 lg:justify-end"><button aria-label="Add folder" class="preset-filled-tertiary-500 btn gap-2"><iconify-icon></iconify-icon> <!></button> <button aria-label="Add Media" class="preset-filled-primary-500 btn gap-2"><iconify-icon></iconify-icon> Add Media</button></div></div> <!> <div class="wrapper overflow-auto"><div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden"><label for="globalSearch">Search</label> <div class="flex gap-2"><div class="input-group input-group-divider grid flex-1 grid-cols-[auto_1fr_auto]"><input id="globalSearch" type="text" placeholder="Search Media" class="input"/> <!></div> <button aria-label="Advanced search" class="preset-filled-surface-500 btn" title="Advanced Search"><iconify-icon></iconify-icon></button></div> <div class="mt-4 flex justify-between"><div class="flex flex-col"><label for="mediaType">Type</label> <select id="mediaType" class="input"></select></div> <div class="flex flex-col text-center"><label for="sortButton">Sort</label> <button id="sortButton" aria-label="Sort" class="preset-outline-surface-500 btn"><iconify-icon></iconify-icon></button></div> <div class="flex items-center justify-center text-center text-xs md:hidden"><div class="flex flex-col items-center justify-center"><div class="flex sm:divide-x sm:divide-gray-500"><!></div></div> <div class="flex flex-col items-center"><p class="text-xs">Size</p> <div class="flex divide-x divide-gray-500"><!></div></div></div></div></div> <div class="mb-4 hidden items-end justify-between gap-4 md:flex"><div class="flex items-end gap-2"><div class="flex flex-col gap-1"><label for="globalSearchMd" class="text-sm font-medium">Search</label> <div class="input-group input-group-divider grid h-11 max-w-md grid-cols-[auto_1fr_auto_auto]"><input id="globalSearchMd" type="text" placeholder="Search" class="input"/> <!></div></div> <button aria-label="Advanced search" class="preset-filled-surface-500 btn gap-2" title="Advanced Search"><iconify-icon></iconify-icon> Advanced</button></div> <div class="flex items-end gap-4"><div class="flex flex-col gap-1"><label for="mediaTypeMd" class="text-sm font-medium">Type</label> <div class="input-group h-11"><select id="mediaTypeMd" class="select"></select></div></div> <div class="flex flex-col gap-1 text-center"><label for="sortButton" class="text-sm font-medium">Sort</label> <button id="sortButton" class="preset-tonal btn h-11" aria-label="Sort"><iconify-icon></iconify-icon></button></div> <div class="flex flex-col items-center gap-1"><span class="text-sm font-medium">Display</span> <div class="h-11 flex divide-x divide-gray-500 border border-surface-500/30 rounded-token overflow-hidden"><button aria-label="Grid" title="Grid View"><iconify-icon></iconify-icon> <span class="text-[10px] hidden xl:inline">Grid</span></button> <button aria-label="Table" title="Table View"><iconify-icon></iconify-icon> <span class="text-[10px] hidden xl:inline">Table</span></button></div></div> <div class="flex flex-col items-center gap-1"><span class="text-sm font-medium">Size</span> <div class="h-11 flex divide-x divide-gray-500 border border-surface-500/30 rounded-token overflow-hidden"><!></div></div></div></div> <!></div>  <!>',
		3
	);
function as(D, e) {
	le(e, !0);
	let n = V(Me([])),
		s = V(Me([])),
		c = V(null),
		v = V(Me([])),
		b = V(''),
		u = V('All'),
		d = V('grid'),
		_ = V('small'),
		f = V('small'),
		g = V(!1),
		R = V(null);
	const N = 100,
		O = [
			{ value: 'All', label: 'ALL' },
			{ value: $e.Image, label: 'IMAGE' },
			{ value: $e.Document, label: 'DOCUMENT' },
			{ value: $e.Audio, label: 'AUDIO' },
			{ value: $e.Video, label: 'VIDEO' },
			{ value: $e.RemoteVideo, label: 'REMOTE VIDEO' }
		],
		w = Pt(() => {
			const I = t(n).filter((F) => {
				const A = (F.filename || '').toLowerCase().includes(t(b).toLowerCase()),
					ot = t(u) === 'All' || F.type === t(u);
				return A && ot;
			});
			return (t(R), I);
		}),
		k = Pt(() => t(w).length > N),
		E = Pt(() => {
			const I = [];
			if ((I.push({ _id: 'root', name: 'Media Root', path: [] }), !t(c))) return I;
			let F = t(c);
			const A = [],
				ot = [];
			for (; F; )
				(A.unshift(F.name), ot.unshift({ _id: F._id, name: F.name, path: [...A] }), (F = t(s).find((Mt) => Mt._id === F?.parentId) || null));
			return [...I, ...ot];
		});
	function m(I, F, A) {
		localStorage.setItem('GalleryUserPreference', `${I}/${F}/${A}`);
	}
	function z() {
		return localStorage.getItem('GalleryUserPreference');
	}
	function S(I) {
		(typeof window < 'u' && window.innerWidth < 768 && Va('leftSidebar', 'hidden'), ga(I));
	}
	const T = Pt(() => t(f));
	(je(() => {
		(e.data &&
			e.data.systemVirtualFolders &&
			o(
				s,
				e.data.systemVirtualFolders.map((A) => ({ ...A, path: Array.isArray(A.path) ? A.path : A.path?.split('/') })),
				!0
			),
			e.data && e.data.currentFolder && o(c, e.data.currentFolder, !0),
			e.data &&
				e.data.media &&
				o(
					n,
					e.data.media.map((A) => ({ ...A, user: typeof A.user == 'object' && A.user ? A.user._id : A.user })),
					!0
				));
		const I = z();
		if (I) {
			const [A, ot, Mt] = I.split('/');
			(o(d, A, !0), o(_, ot, !0), o(f, Mt, !0));
		}
		const F = (A) => {
			const { folderId: ot } = A.detail;
			Y(ot && ot !== 'root' ? ot : null);
		};
		return (
			document.addEventListener('systemVirtualFolderSelected', F),
			() => {
				document.removeEventListener('systemVirtualFolderSelected', F);
			}
		);
	}),
		je(() => {
			M();
		}));
	function M() {
		if (!t(c)) {
			o(v, ['Media Root'], !0);
			return;
		}
		o(
			v,
			((F) => {
				const A = ['Media Root'];
				let ot = F;
				const Mt = [];
				for (; ot; ) (Mt.unshift(ot.name), (ot = t(s).find((Yt) => Yt._id === ot?.parentId) || null));
				return [...A, ...Mt];
			})(t(c)),
			!0
		);
	}
	async function p(I) {
		const F = I.trim();
		if (!F) {
			se.error({ description: 'Folder name cannot be empty' });
			return;
		}
		if (/[\\/:"*?<>|]/.test(F)) {
			se.error({ description: 'Folder name contains invalid characters (\\ / : * ? " < > |)' });
			return;
		}
		if (F.length > 50) {
			se.error({ description: 'Folder name must be 50 characters or less' });
			return;
		}
		(o(g, !0), na.startLoading(ra.dataFetch));
		try {
			const A = t(c)?._id ?? null,
				ot = await fetch('/api/systemVirtualFolder', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: F, parentId: A })
				});
			if (!ot.ok) {
				const Yt = await ot.json();
				throw new Error(Yt.error || `HTTP error! status: ${ot.status}`);
			}
			const Mt = await ot.json();
			if (Mt.success)
				(o(s, await G(), !0),
					document.dispatchEvent(new CustomEvent('folderCreated', { detail: { folder: Mt.folder, parentId: A } })),
					se.success({ description: 'Folder created successfully' }));
			else throw new Error(Mt.error || 'Failed to create folder');
		} catch (A) {
			qt.error('Error creating folder:', A);
			const ot =
				A instanceof Error && A.message.includes('duplicate')
					? A.message
					: A instanceof Error && A.message.includes('invalid')
						? 'Invalid folder name'
						: 'Failed to create folder';
			se.error({ description: ot });
		} finally {
			(o(g, !1), na.stopLoading(ra.dataFetch));
		}
	}
	async function G() {
		try {
			const F = await (await fetch('/api/systemVirtualFolder')).json();
			if (F.success) return F.data.map((A) => ({ ...A, path: Array.isArray(A.path) ? A.path : A.path?.split('/') }));
			throw new Error(F.error || 'Failed to fetch folders');
		} catch (I) {
			return (qt.error('Error fetching updated folders:', I), se.error({ description: 'Failed to fetch folders' }), []);
		}
	}
	let L = V(null);
	async function U(I = !1) {
		const F = t(c) ? t(c)._id : 'root';
		if (!(!I && (t(g) || F === t(L)))) {
			(o(g, !0), na.startLoading(ra.dataFetch), o(L, F, !0));
			try {
				const { data: A } = await Xa.get(`/api/systemVirtualFolder/${F}`, { timeout: 1e4 });
				if (A.success)
					(o(n, Array.isArray(A.data.contents?.files) ? A.data.contents.files : [], !0), qt.info(`Fetched ${t(n).length} files for folder: ${F}`));
				else throw new Error(A.error || 'Unknown error');
			} catch (A) {
				qt.error('Error fetching media files:', A);
				let ot = 'Failed to load media';
				(A instanceof Error &&
					(A.message.includes('timeout')
						? (ot = 'Request timed out - please try again')
						: A.message.includes('network') && (ot = 'Network error - please check your connection')),
					se.error({ description: ot }),
					o(n, [], !0));
			} finally {
				(o(g, !1), na.stopLoading(ra.dataFetch));
			}
		}
	}
	async function Y(I) {
		try {
			(I === null ? o(c, null) : o(c, t(s).find((F) => F._id === I) || null, !0), M(), await U());
		} catch (F) {
			(qt.error('Error opening folder:', F), se.error({ description: 'Failed to open folder' }));
		}
	}
	function Q(I) {
		(o(d, I, !0), m(t(d), t(_), t(f)));
	}
	function dt(I) {
		(o(d, I.type, !0), I.type === 'grid' ? o(_, I.size, !0) : o(f, I.size, !0), m(t(d), t(_), t(f)));
	}
	function lt() {
		o(b, '');
	}
	function X() {
		const I = t(c) ? (Array.isArray(t(c).path) ? t(c).path.join('/') : t(c).path) : va?.MEDIA_FOLDER || 'mediaFiles';
		oa.trigger(eo, { title: 'Add Folder', body: `Creating subfolder in: <span class="text-tertiary-500 dark:text-primary-500">${I}</span>` }, (F) => {
			F && p(F);
		});
	}
	async function P(I) {
		xa({
			title: 'Delete Media',
			body: `Are you sure you want to delete "${I.filename}"? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					qt.info('Delete image request:', { _id: I._id, filename: I.filename });
					const F = new FormData();
					F.append('imageData', JSON.stringify(I));
					const A = await fetch('?/deleteMedia', { method: 'POST', body: F });
					if ((qt.info('Delete response status:', A.status), !A.ok)) {
						const ie = await A.text();
						throw (qt.error('Delete failed with status:', A.status, ie), new Error(`Server error: ${A.status} - ${ie}`));
					}
					const ot = await A.json();
					qt.debug('Delete response:', ot);
					let Mt = ot;
					if (
						(ot.type === 'success' && ot.data && (Mt = typeof ot.data == 'string' ? JSON.parse(ot.data) : ot.data),
						Array.isArray(Mt) ? Mt[0]?.success : Mt?.success)
					)
						(se.success({ description: 'Media deleted successfully.' }),
							o(
								n,
								t(n).filter((ie) => ie._id !== I._id),
								!0
							),
							qt.info(`Removed file ${I.filename} from UI. Remaining: ${t(n).length} files`));
					else throw new Error(Mt?.error || 'Failed to delete media');
				} catch (F) {
					const A = F instanceof Error ? F.message : String(F);
					(qt.error('Error deleting media:', A), se.error({ description: `Error deleting media: ${A}` }));
				}
			}
		});
	}
	async function H(I) {
		xa({
			title: 'Delete Multiple Media',
			body: `Are you sure you want to delete ${I.length} file${I.length > 1 ? 's' : ''}? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					qt.info('Bulk delete request:', { count: I.length });
					const F = new Set();
					let A = 0,
						ot = 0;
					for (const Mt of I)
						try {
							const Yt = new FormData();
							Yt.append('imageData', JSON.stringify(Mt));
							const ie = await fetch('?/deleteMedia', { method: 'POST', body: Yt });
							if (ie.ok) {
								const ge = await ie.json();
								let Ht = ge;
								(ge.type === 'success' && ge.data && (Ht = typeof ge.data == 'string' ? JSON.parse(ge.data) : ge.data),
									(Array.isArray(Ht) ? Ht[0]?.success : Ht?.success) ? (A++, F.add(Mt._id)) : ot++);
							} else ot++;
						} catch (Yt) {
							(qt.error('Error deleting file:', Mt.filename, Yt), ot++);
						}
					(ot === 0
						? se.success({ description: `Successfully deleted ${A} file${A > 1 ? 's' : ''}` })
						: A === 0
							? se.error({ description: `Failed to delete ${ot} file${ot > 1 ? 's' : ''}` })
							: se.warning({ description: `Deleted ${A} file${A > 1 ? 's' : ''}, ${ot} failed` }),
						o(
							n,
							t(n).filter((Mt) => !F.has(Mt._id)),
							!0
						),
						qt.info(`Removed ${A} files from UI. Remaining: ${t(n).length} files`));
				} catch (F) {
					const A = F instanceof Error ? F.message : String(F);
					(qt.error('Error in bulk delete:', A), se.error({ description: `Error deleting media: ${A}` }));
				}
			}
		});
	}
	async function W(I) {
		try {
			const F = await fetch('/api/media/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ criteria: I })
			});
			if (!F.ok) throw new Error('Search failed');
			const A = await F.json();
			(o(n, A.files, !0),
				o(R, I, !0),
				oa.close(),
				se.success({ description: `Found ${A.totalCount} file${A.totalCount === 1 ? '' : 's'} matching ${A.matchedCriteria.length} criteria` }));
		} catch (F) {
			(qt.error('Advanced search error:', F), se.error({ description: 'Search failed. Please try again.' }));
		}
	}
	function x() {
		(o(R, null), U());
	}
	function B() {
		oa.trigger(zn, { files: t(n), onSearch: W, modalClasses: 'max-w-4xl max-h-[95vh]' });
	}
	async function q(I) {
		if ((console.log('handleEditImage called with:', I), !I)) {
			console.warn('handleEditImage: File is null/undefined');
			return;
		}
		const F = I.url || ao(I),
			A = { ...I, url: F };
		oa.trigger(Qr, { image: A, onsave: rt, modalClasses: 'w-full h-full max-w-none max-h-none p-0' });
	}
	async function rt(I) {
		const { file: F } = I,
			A = new FormData();
		A.append('files', F);
		try {
			if ((await fetch('/mediagallery?/upload', { method: 'POST', body: A })).ok) (se.success({ description: 'Image saved successfully!' }), U(!0));
			else throw new Error('Failed to save edited image');
		} catch (ot) {
			(se.error({ description: 'Error saving image' }), qt.error('Error saving edited image', ot));
		}
	}
	function kt(I) {
		const F = t(n).findIndex((A) => A._id === I._id);
		F !== -1 && (t(n)[F] = I);
	}
	var ft = xo(),
		zt = ct(ft),
		pt = i(zt);
	Ja(pt, {
		name: 'Media Gallery',
		icon: 'bi:images',
		showBackButton: !0,
		backUrl: '/',
		onBackClick: (I) => {
			try {
				I();
			} catch (F) {
				(qt.error('Navigation error:', F), ga('/'));
			}
		}
	});
	var Ft = r(pt, 2),
		J = i(Ft);
	J.__click = X;
	var vt = i(J);
	(l(vt, 'icon', 'mdi:folder-add-outline'), l(vt, 'width', '24'));
	var At = r(vt),
		Ct = r(At);
	{
		var Nt = (I) => {
			var F = io();
			h(I, F);
		};
		K(Ct, (I) => {
			t(g) && I(Nt);
		});
	}
	a(J);
	var ve = r(J, 2);
	ve.__click = () => S('/mediagallery/uploadMedia');
	var Ae = i(ve);
	(l(Ae, 'icon', 'carbon:add-filled'), l(Ae, 'width', '24'), nt(), a(ve), a(Ft), a(zt));
	var we = r(zt, 2);
	di(we, {
		get breadcrumb() {
			return t(v);
		},
		get folders() {
			return t(E);
		},
		openFolder: Y
	});
	var _e = r(we, 2),
		Fe = i(_e),
		ke = r(i(Fe), 2),
		Z = i(ke),
		st = i(Z);
	Kt(st);
	var Qt = r(st, 2);
	{
		var tt = (I) => {
			var F = no();
			F.__click = () => o(b, '');
			var A = i(F);
			(l(A, 'icon', 'ic:outline-search-off'), l(A, 'width', '24'), a(F), h(I, F));
		};
		K(Qt, (I) => {
			t(b) && I(tt);
		});
	}
	a(Z);
	var et = r(Z, 2);
	et.__click = B;
	var Rt = i(et);
	(l(Rt, 'icon', 'mdi:magnify-plus-outline'), l(Rt, 'width', '24'), a(et), a(ke));
	var St = r(ke, 2),
		ut = i(St),
		Bt = r(i(ut), 2);
	(Be(
		Bt,
		21,
		() => O,
		Ke,
		(I, F) => {
			var A = ro(),
				ot = i(A, !0);
			a(A);
			var Mt = {};
			($(() => {
				(at(ot, t(F).label), Mt !== (Mt = t(F).value) && (A.value = (A.__value = t(F).value) ?? ''));
			}),
				h(I, A));
		}
	),
		a(Bt),
		a(ut));
	var re = r(ut, 2),
		It = r(i(re), 2),
		gt = i(It);
	(l(gt, 'icon', 'flowbite:sort-outline'), l(gt, 'width', '24'), a(It), a(re));
	var Ut = r(re, 2),
		Vt = i(Ut),
		$t = i(Vt),
		ae = i($t);
	{
		var Pe = (I) => {
				var F = oo();
				F.__click = () => Q('table');
				var A = r(i(F), 2);
				(l(A, 'icon', 'material-symbols:list-alt-outline'), l(A, 'height', '44'), Ye(A, 'color: text-black dark:text-white'), nt(2), a(F), h(I, F));
			},
			Ot = (I) => {
				var F = so();
				F.__click = () => Q('grid');
				var A = r(i(F), 2);
				(l(A, 'icon', 'material-symbols:grid-view-rounded'), l(A, 'height', '42'), Ye(A, 'color: text-black dark:text-white'), nt(2), a(F), h(I, F));
			};
		K(ae, (I) => {
			t(d) === 'grid' ? I(Pe) : I(Ot, !1);
		});
	}
	(a($t), a(Vt));
	var Lt = r(Vt, 2),
		_t = r(i(Lt), 2),
		te = i(_t);
	{
		var De = (I) => {
				var F = lo();
				F.__click = () => {
					const ot =
						t(d) === 'grid'
							? t(_) === 'tiny'
								? 'small'
								: t(_) === 'small'
									? 'medium'
									: t(_) === 'medium'
										? 'large'
										: 'tiny'
							: t(f) === 'tiny'
								? 'small'
								: t(f) === 'small'
									? 'medium'
									: t(f) === 'medium'
										? 'large'
										: 'tiny';
					(t(d) === 'grid' ? o(_, ot, !0) : o(f, ot, !0), m(t(d), t(_), t(f)));
				};
				var A = i(F);
				(l(A, 'icon', 'material-symbols:apps'), l(A, 'height', '40'), Ye(A, 'color:text-black dark:text-white'), nt(2), a(F), h(I, F));
			},
			Se = (I) => {
				var F = Zt(),
					A = ct(F);
				{
					var ot = (Yt) => {
							var ie = co();
							ie.__click = () => {
								const Ht =
									t(d) === 'grid'
										? t(_) === 'tiny'
											? 'small'
											: t(_) === 'small'
												? 'medium'
												: t(_) === 'medium'
													? 'large'
													: 'tiny'
										: t(f) === 'tiny'
											? 'small'
											: t(f) === 'small'
												? 'medium'
												: t(f) === 'medium'
													? 'large'
													: 'tiny';
								(t(d) === 'grid' ? o(_, Ht, !0) : o(f, Ht, !0), m(t(d), t(_), t(f)));
							};
							var ge = i(ie);
							(l(ge, 'icon', 'material-symbols:background-grid-small-sharp'),
								l(ge, 'height', '40'),
								Ye(ge, 'color:text-black dark:text-white'),
								nt(2),
								a(ie),
								h(Yt, ie));
						},
						Mt = (Yt) => {
							var ie = Zt(),
								ge = ct(ie);
							{
								var Ht = (Ce) => {
										var me = uo();
										me.__click = () => {
											const We =
												t(d) === 'grid'
													? t(_) === 'tiny'
														? 'small'
														: t(_) === 'small'
															? 'medium'
															: t(_) === 'medium'
																? 'large'
																: 'tiny'
													: t(f) === 'tiny'
														? 'small'
														: t(f) === 'small'
															? 'medium'
															: t(f) === 'medium'
																? 'large'
																: 'tiny';
											(t(d) === 'grid' ? o(_, We, !0) : o(f, We, !0), m(t(d), t(_), t(f)));
										};
										var Ne = i(me);
										(l(Ne, 'icon', 'material-symbols:grid-on-sharp'),
											l(Ne, 'height', '40'),
											Ye(Ne, 'color: text-black dark:text-white'),
											nt(2),
											a(me),
											h(Ce, me));
									},
									xe = (Ce) => {
										var me = fo();
										me.__click = () => {
											const We =
												t(d) === 'grid'
													? t(_) === 'tiny'
														? 'small'
														: t(_) === 'small'
															? 'medium'
															: t(_) === 'medium'
																? 'large'
																: 'tiny'
													: t(f) === 'tiny'
														? 'small'
														: t(f) === 'small'
															? 'medium'
															: t(f) === 'medium'
																? 'large'
																: 'tiny';
											(t(d) === 'grid' ? o(_, We, !0) : o(f, We, !0), m(t(d), t(_), t(f)));
										};
										var Ne = i(me);
										(l(Ne, 'icon', 'material-symbols:grid-view'),
											l(Ne, 'height', '40'),
											Ye(Ne, 'color: text-black dark:text-white'),
											nt(2),
											a(me),
											h(Ce, me));
									};
								K(
									ge,
									(Ce) => {
										(t(d) === 'grid' && t(_) === 'medium') || (t(d) === 'table' && t(f) === 'medium') ? Ce(Ht) : Ce(xe, !1);
									},
									!0
								);
							}
							h(Yt, ie);
						};
					K(
						A,
						(Yt) => {
							(t(d) === 'grid' && t(_) === 'small') || (t(d) === 'table' && t(f) === 'small') ? Yt(ot) : Yt(Mt, !1);
						},
						!0
					);
				}
				h(I, F);
			};
		K(te, (I) => {
			(t(d) === 'grid' && t(_) === 'tiny') || (t(d) === 'table' && t(f) === 'tiny') ? I(De) : I(Se, !1);
		});
	}
	(a(_t), a(Lt), a(Ut), a(St), a(Fe));
	var de = r(Fe, 2),
		Wt = i(de),
		ne = i(Wt),
		yt = r(i(ne), 2),
		bt = i(yt);
	Kt(bt);
	var jt = r(bt, 2);
	{
		var ue = (I) => {
			var F = vo();
			F.__click = lt;
			var A = i(F);
			(l(A, 'icon', 'ic:outline-search-off'), l(A, 'width', '24'), a(F), h(I, F));
		};
		K(jt, (I) => {
			t(b) && I(ue);
		});
	}
	(a(yt), a(ne));
	var Xt = r(ne, 2);
	Xt.__click = B;
	var mt = i(Xt);
	(l(mt, 'icon', 'mdi:magnify-plus-outline'), l(mt, 'width', '24'), nt(), a(Xt), a(Wt));
	var Dt = r(Wt, 2),
		Gt = i(Dt),
		j = r(i(Gt), 2),
		ht = i(j);
	(Be(
		ht,
		21,
		() => O,
		Ke,
		(I, F) => {
			var A = ho(),
				ot = i(A, !0);
			a(A);
			var Mt = {};
			($(() => {
				(at(ot, t(F).label), Mt !== (Mt = t(F).value) && (A.value = (A.__value = t(F).value) ?? ''));
			}),
				h(I, A));
		}
	),
		a(ht),
		a(j),
		a(Gt));
	var Et = r(Gt, 2),
		xt = r(i(Et), 2),
		Jt = i(xt);
	(l(Jt, 'icon', 'flowbite:sort-outline'), l(Jt, 'width', '24'), a(xt), a(Et));
	var ee = r(Et, 2),
		pe = r(i(ee), 2),
		Te = i(pe);
	Te.__click = () => Q('grid');
	var Ge = i(Te);
	(l(Ge, 'icon', 'material-symbols:grid-view-rounded'), l(Ge, 'height', '20'), nt(2), a(Te));
	var he = r(Te, 2);
	he.__click = () => Q('table');
	var oe = i(he);
	(l(oe, 'icon', 'material-symbols:list-alt-outline'), l(oe, 'height', '20'), nt(2), a(he), a(pe), a(ee));
	var Ie = r(ee, 2),
		Oe = r(i(Ie), 2),
		Le = i(Oe);
	{
		var He = (I) => {
				var F = mo();
				F.__click = () => {
					(t(d) === 'grid' ? o(_, 'small') : o(f, 'small'), m(t(d), t(_), t(f)));
				};
				var A = i(F);
				(l(A, 'icon', 'material-symbols:apps'), l(A, 'height', '20'), nt(2), a(F), h(I, F));
			},
			ze = (I) => {
				var F = Zt(),
					A = ct(F);
				{
					var ot = (Yt) => {
							var ie = po();
							ie.__click = () => {
								(t(d) === 'grid' ? o(_, 'medium') : o(f, 'medium'), m(t(d), t(_), t(f)));
							};
							var ge = i(ie);
							(l(ge, 'icon', 'material-symbols:background-grid-small-sharp'), l(ge, 'height', '20'), nt(2), a(ie), h(Yt, ie));
						},
						Mt = (Yt) => {
							var ie = Zt(),
								ge = ct(ie);
							{
								var Ht = (Ce) => {
										var me = go();
										me.__click = () => {
											(t(d) === 'grid' ? o(_, 'large') : o(f, 'large'), m(t(d), t(_), t(f)));
										};
										var Ne = i(me);
										(l(Ne, 'icon', 'material-symbols:grid-on-sharp'), l(Ne, 'height', '20'), nt(2), a(me), h(Ce, me));
									},
									xe = (Ce) => {
										var me = bo();
										me.__click = () => {
											(t(d) === 'grid' ? o(_, 'tiny') : o(f, 'tiny'), m(t(d), t(_), t(f)));
										};
										var Ne = i(me);
										(l(Ne, 'icon', 'material-symbols:grid-view'), l(Ne, 'height', '20'), nt(2), a(me), h(Ce, me));
									};
								K(
									ge,
									(Ce) => {
										(t(d) === 'grid' && t(_) === 'medium') || (t(d) === 'table' && t(f) === 'medium') ? Ce(Ht) : Ce(xe, !1);
									},
									!0
								);
							}
							h(Yt, ie);
						};
					K(
						A,
						(Yt) => {
							(t(d) === 'grid' && t(_) === 'small') || (t(d) === 'table' && t(f) === 'small') ? Yt(ot) : Yt(Mt, !1);
						},
						!0
					);
				}
				h(I, F);
			};
		K(Le, (I) => {
			(t(d) === 'grid' && t(_) === 'tiny') || (t(d) === 'table' && t(f) === 'tiny') ? I(He) : I(ze, !1);
		});
	}
	(a(Oe), a(Ie), a(Dt), a(de));
	var Ue = r(de, 2);
	{
		var Je = (I) => {
				var F = Zt(),
					A = ct(F);
				{
					var ot = (Yt) => {
							var ie = yo(),
								ge = ct(ie);
							Dn(ge, {
								get filteredFiles() {
									return t(w);
								},
								get gridSize() {
									return t(_);
								},
								ondeleteImage: P,
								onBulkDelete: H,
								onEditImage: q
							});
							var Ht = r(ge, 2),
								xe = i(Ht);
							(l(xe, 'icon', 'mdi:lightning-bolt'), l(xe, 'width', '20'));
							var Ce = r(xe, 2),
								me = i(Ce);
							(a(Ce), a(Ht), $(() => at(me, `Virtual scrolling enabled for optimal performance with ${t(w).length ?? ''} files`)), h(Yt, ie));
						},
						Mt = (Yt) => {
							qi(Yt, {
								get filteredFiles() {
									return t(w);
								},
								get gridSize() {
									return t(_);
								},
								ondeleteImage: P,
								onBulkDelete: H,
								onsizechange: dt,
								onEditImage: q,
								onUpdateImage: kt
							});
						};
					K(A, (Yt) => {
						t(k) ? Yt(ot) : Yt(Mt, !1);
					});
				}
				h(I, F);
			},
			Qe = (I) => {
				un(I, {
					get filteredFiles() {
						return t(w);
					},
					get tableSize() {
						return t(T);
					},
					ondeleteImage: P,
					onEditImage: q,
					onUpdateImage: kt,
					onDeleteFiles: H
				});
			};
		K(Ue, (I) => {
			t(d) === 'grid' ? I(Je) : I(Qe, !1);
		});
	}
	a(_e);
	var da = r(_e, 2);
	{
		var ua = (I) => {
			var F = _o(),
				A = i(F);
			(l(A, 'icon', 'mdi:filter'), l(A, 'width', '20'));
			var ot = r(A, 4);
			ot.__click = x;
			var Mt = i(ot);
			(l(Mt, 'icon', 'mdi:close'), l(Mt, 'width', '18'), a(ot), a(F), h(I, F));
		};
		K(da, (I) => {
			t(R) && I(ua);
		});
	}
	($(() => {
		((J.disabled = t(g)),
			ye(J, 'aria-busy', t(g)),
			at(At, ` ${t(g) ? 'Creating...' : 'Add folder'} `),
			wt(
				Te,
				1,
				`h-full px-3 flex flex-col items-center justify-center transition-colors ${t(d) === 'grid' ? 'bg-primary-500/20 text-primary-500' : 'hover:bg-surface-500/10'}`
			),
			wt(
				he,
				1,
				`h-full px-3 flex flex-col items-center justify-center transition-colors ${t(d) === 'table' ? 'bg-primary-500/20 text-primary-500' : 'hover:bg-surface-500/10'}`
			));
	}),
		Re(
			st,
			() => t(b),
			(I) => o(b, I)
		),
		sa(
			Bt,
			() => t(u),
			(I) => o(u, I)
		),
		Re(
			bt,
			() => t(b),
			(I) => o(b, I)
		),
		sa(
			ht,
			() => t(u),
			(I) => o(u, I)
		),
		h(D, ft),
		ce());
}
Ee(['click']);
export { as as component };
//# sourceMappingURL=21.y6o_i9qX.js.map
