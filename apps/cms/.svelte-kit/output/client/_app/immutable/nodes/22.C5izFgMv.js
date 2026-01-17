import { i as ie } from '../chunks/zi73tRJP.js';
import {
	p as De,
	d as B,
	x as he,
	z as qe,
	g as e,
	B as ct,
	b as _,
	f as U,
	s as n,
	a as je,
	c as o,
	n as ee,
	r as s,
	t as A,
	u as xe,
	ag as dt
} from '../chunks/DrlZFkx8.js';
import { d as ze, f, a as c, e as Re, c as Fe, s as Y } from '../chunks/CTjXDULS.js';
import { c as O } from '../chunks/7bh91wXp.js';
import { b as u, c as ge, a as Q, s as pt } from '../chunks/MEFvoR_D.js';
import { av as ft } from '../chunks/N8Jg0v49.js';
import { P as ut } from '../chunks/C6jjkVLf.js';
import { e as vt } from '../chunks/BXe5mj2j.js';
import { b as Te } from '../chunks/YQp2a1pQ.js';
import { l as we } from '../chunks/BvngfGKt.js';
import { t as be } from '../chunks/C-hhfhAN.js';
import { g as mt } from '../chunks/DHPSYX_z.js';
import { T as ne } from '../chunks/CPMcYF9a.js';
import { P as yt } from '../chunks/Kpla-k0W.js';
import { b as _t } from '../chunks/D4QnGYgQ.js';
import { s as Me } from '../chunks/BSPmpUse.js';
import { T as Z } from '../chunks/BpC4PXBd.js';
var gt = f(
		'<div class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-secondary-50 dark:border-surface-500 dark:bg-surface-700" role="region" aria-label="File drop zone"><div class="grid grid-cols-6 items-center p-4"><iconify-icon></iconify-icon> <div class="col-span-5 space-y-4 text-center"><p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">Media Upload</span> Drag files here to upload</p> <p class="text-sm opacity-75">Multiple files allowed</p> <button type="button" class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500">Browse Files</button> <p class="mt-2 text-sm text-tertiary-500 dark:text-primary-500">Max File Size: 50 MB</p></div></div> <input type="file" class="sr-only" hidden="" multiple aria-hidden="true" tabindex="-1"/></div>',
		2
	),
	bt = f('<button type="button" class="btn-icon rounded-full" aria-label="Remove file"><iconify-icon></iconify-icon></button>', 2),
	ht = f('Remove file <!>', 1),
	xt = f('<!> <!>', 1),
	wt = f('<img class="h-full w-full object-contain"/>'),
	$t = f('<audio controls class="max-w-full"><source/></audio>'),
	kt = f('<iconify-icon></iconify-icon>', 2),
	Ut = f(
		'<div class="group relative overflow-hidden rounded border border-surface-200 shadow-sm transition-all hover:shadow-md dark:border-surface-500"><div class="absolute right-1 top-1 z-10 flex cursor-pointer shadow-sm"><!></div> <div class="flex aspect-square items-center justify-center"><!></div> <div class="label overflow-hidden text-ellipsis whitespace-nowrap p-1 text-center font-bold text-xs text-tertiary-500 dark:text-primary-500"> </div> <div class="flex grow items-center justify-between p-1 text-white"><div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden"><iconify-icon></iconify-icon> <span class="truncate text-[10px] uppercase"> </span></div> <p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 text-[10px]"><span> </span> KB</p></div></div>',
		2
	),
	Pt = f('<iconify-icon></iconify-icon> <span> </span>', 3),
	Lt = f('<iconify-icon></iconify-icon> <span> </span>', 3),
	Et = f(
		`<div class="mb-5 text-center sm:text-left"><p class="text-center text-tertiary-500 dark:text-primary-500">This area facilitates the queuing and previewing of media files before they are officially uploaded to the gallery. Verify your selection below,
			then confirm to complete the transfer.</p></div> <div class="flex flex-col space-y-4"><div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"><!> <button type="button" class="btn preset-tonal flex-col items-center gap-2"><iconify-icon></iconify-icon> <span class="font-bold">Add Files</span></button></div> <input type="file" class="hidden" multiple/> <div class="flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700"><button type="button" class="btn preset-outlined-surface-500">Cancel</button> <button type="button" class="btn dark:preset-filled-primary-500 preset-filled-tertiary-500"><!></button></div></div>`,
		3
	),
	Rt = f(
		'<div class="mt-4 w-full rounded border border-surface-400 bg-surface-100 p-4 dark:bg-surface-700"><div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-300 dark:bg-surface-600"><div class="h-full bg-primary-500 transition-all duration-300"></div></div> <div class="flex items-center justify-between text-xs text-surface-600 dark:text-surface-50"><span> </span></div></div>'
	),
	Ft = f('<!> <!>', 1);
function Tt(te, re) {
	De(re, !0);
	let d = B(he([])),
		g = B(null),
		P = B(null),
		L = B(0),
		E = B(0),
		R = B(!1),
		h = he(new Set()),
		v = B(he(new Map()));
	const k = 50 * 1024 * 1024,
		Ae = [
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'image/svg+xml',
			'video/mp4',
			'video/webm',
			'audio/mpeg',
			'audio/wav',
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		];
	(qe(() => {
		const t = e(d),
			r = ct(() => new Map(e(v))),
			i = new Map(r);
		let a = !0;
		async function b() {
			for (const l of t) {
				if (!a) return;
				const y = `${l.name}-${l.size}`;
				if (!i.has(y) && (l.type?.startsWith('image/') || l.type?.startsWith('audio/'))) {
					const p = URL.createObjectURL(l);
					(i.set(y, p), _(v, new Map(i), !0), await new Promise((M) => requestAnimationFrame(M)));
				}
			}
			if (a) {
				const l = new Set(t.map((y) => `${y.name}-${y.size}`));
				for (const [y, p] of r) l.has(y) || (URL.revokeObjectURL(p), i.delete(y));
				_(v, i, !0);
			}
		}
		return (
			b(),
			() => {
				a = !1;
			}
		);
	}),
		qe(() => () => {
			e(v).forEach((t) => URL.revokeObjectURL(t));
		}));
	function le(t) {
		const r = t.name.substring(t.name.lastIndexOf('.')).toLowerCase();
		switch (!0) {
			case t.type?.startsWith('image/'):
				return 'fa-solid:image';
			case t.type?.startsWith('video/'):
				return 'fa-solid:video';
			case t.type?.startsWith('audio/'):
				return 'fa-solid:play-circle';
			case r === '.pdf':
				return 'vscode-icons:file-type-pdf2';
			case r === '.doc' || r === '.docx' || r === '.docm':
				return 'vscode-icons:file-type-word';
			case r === '.ppt' || r === '.pptx':
				return 'vscode-icons:file-type-powerpoint';
			case r === '.xls' || r === '.xlsx':
				return 'vscode-icons:file-type-excel';
			case r === '.txt':
				return 'fa-solid:file-lines';
			case r === '.zip' || r === '.rar':
				return 'fa-solid:file-zipper';
			default:
				return 'vscode-icons:file';
		}
	}
	function ce(t) {
		if (!t) return 'Unknown';
		const r = t.split('/');
		return r[1] ? r[1].toUpperCase() : r[0].toUpperCase();
	}
	function ae(t) {
		const r = [],
			i = [];
		(t.forEach((a) => {
			if (a.size > k) i.push(`${a.name} exceeds maximum file size of 50MB`);
			else if (!Ae.includes(a.type)) i.push(`${a.name} is not an allowed file type`);
			else {
				const b = `${a.name}-${a.size}`;
				h.has(b) || (r.push(a), h.add(b));
			}
		}),
			i.length > 0 &&
				be.error({
					description: i.join(`
`)
				}),
			r.length > 0 && _(d, [...e(d), ...r], !0));
	}
	function $e(t) {
		(t.preventDefault(), t.dataTransfer && ae(Array.from(t.dataTransfer.files)));
	}
	function I() {
		!e(g) || !e(g).files || (ae(Array.from(e(g).files)), e(g) && (e(g).value = ''));
	}
	function q(t) {
		(t.preventDefault(), t.stopPropagation(), e(P) && (e(P).style.borderColor = '#5fd317'));
	}
	function J(t) {
		(t.preventDefault(), t.stopPropagation(), e(P)?.style.removeProperty('border-color'));
	}
	function de(t) {
		const r = `${t.name}-${t.size}`;
		(_(
			d,
			e(d).filter((i) => i !== t),
			!0
		),
			h.delete(r));
	}
	function w() {
		(_(d, [], !0), h.clear(), e(v).forEach((t) => URL.revokeObjectURL(t)), _(v, new Map(), !0));
	}
	function N(t) {
		if (t === 0) return '0 Bytes';
		const r = 1024,
			i = ['Bytes', 'KB', 'MB', 'GB'],
			a = Math.floor(Math.log(t) / Math.log(r));
		return parseFloat((t / Math.pow(r, a)).toFixed(2)) + ' ' + i[a];
	}
	async function pe() {
		if (e(d).length === 0) {
			be.warning({ description: 'No files selected for upload' });
			return;
		}
		(_(R, !0), _(L, 0));
		const t = Date.now();
		let r = 0;
		const i = new FormData();
		e(d).forEach((a) => {
			i.append('files', a);
		});
		try {
			const a = new XMLHttpRequest();
			a.upload.addEventListener('progress', (p) => {
				if (p.lengthComputable) {
					_(L, Math.round((p.loaded * 100) / p.total), !0);
					const F = (Date.now() - t) / 1e3,
						x = p.loaded - r;
					(_(E, F > 0 ? x / F : 0, !0), (r = p.loaded));
				}
			});
			const b = new Promise((p, M) => {
				((a.onload = () => {
					if (a.status >= 200 && a.status < 300)
						try {
							const F = JSON.parse(a.responseText);
							let x = F.data;
							if (typeof x == 'string')
								try {
									((x = JSON.parse(x)), we.debug('Parsed stringified data:', x));
								} catch {
									we.warn('Data is a string but not valid JSON:', x);
								}
							F.type === 'success' && x ? p(x) : F.success !== void 0 ? p(F) : M(new Error('Invalid response format'));
						} catch {
							M(new Error('Invalid response format'));
						}
					else M(new Error(`Upload failed: ${a.status}`));
				}),
					(a.onerror = () => M(new Error('Network error'))));
			});
			(a.open('POST', '/mediagallery?/upload'), a.send(i));
			const l = await b;
			if (Array.isArray(l) ? l[0]?.success : l?.success)
				(be.success({ description: 'Files uploaded successfully' }), w(), mt('/mediagallery', { invalidateAll: !0 }));
			else throw new Error((Array.isArray(l) ? l[0]?.error : l?.error) || 'Upload failed');
		} catch (a) {
			(we.error('Error uploading files:', a),
				be.error({ description: 'Error uploading files: ' + (a instanceof Error ? a.message : 'Unknown error') }));
		} finally {
			_(R, !1);
		}
	}
	var fe = Ft(),
		W = U(fe);
	{
		var V = (t) => {
				var r = gt(),
					i = o(r),
					a = o(i);
				(u(a, 'icon', 'fa6-solid:file-arrow-up'), u(a, 'width', '40'), u(a, 'aria-hidden', 'true'));
				var b = n(a, 2),
					l = n(o(b), 4);
				((l.__click = () => e(g)?.click()), ee(2), s(b), s(i));
				var y = n(i, 2);
				((y.__change = I),
					Te(
						y,
						(p) => _(g, p),
						() => e(g)
					),
					s(r),
					Te(
						r,
						(p) => _(P, p),
						() => e(P)
					),
					A(() => (l.disabled = e(R))),
					Re('drop', r, $e),
					Re('dragover', r, q),
					Re('dragleave', r, J),
					c(t, r));
			},
			oe = (t) => {
				var r = Et(),
					i = n(U(r), 2),
					a = o(i),
					b = o(a);
				vt(
					b,
					17,
					() => e(d),
					($) => $.name + $.size,
					($, m) => {
						const K = xe(() => `${e(m).name}-${e(m).size}`),
							D = xe(() => e(v).get(e(K))),
							G = xe(() => le(e(m)));
						var Ue = Ut(),
							Pe = o(Ue),
							Xe = o(Pe);
						(ne(Xe, {
							positioning: { placement: 'top' },
							children: (j, C) => {
								var ye = xt(),
									_e = U(ye);
								O(
									_e,
									() => ne.Trigger,
									(z, T) => {
										T(z, {
											children: (X, Ne) => {
												var H = bt();
												H.__click = () => de(e(m));
												var se = o(H);
												(u(se, 'icon', 'material-symbols:delete'), u(se, 'width', '24'), ge(se, 1, 'text-error-500'), s(H), c(X, H));
											},
											$$slots: { default: !0 }
										});
									}
								);
								var Ee = n(_e, 2);
								(yt(Ee, {
									children: (z, T) => {
										var X = Fe(),
											Ne = U(X);
										(O(
											Ne,
											() => ne.Positioner,
											(H, se) => {
												se(H, {
													children: (tt, It) => {
														var We = Fe(),
															rt = U(We);
														(O(
															rt,
															() => ne.Content,
															(at, ot) => {
																ot(at, {
																	class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
																	children: (st, Nt) => {
																		ee();
																		var Ke = ht(),
																			it = n(U(Ke));
																		(O(
																			it,
																			() => ne.Arrow,
																			(nt, lt) => {
																				lt(nt, { class: 'fill-surface-900 dark:fill-surface-100' });
																			}
																		),
																			c(st, Ke));
																	},
																	$$slots: { default: !0 }
																});
															}
														),
															c(tt, We));
													},
													$$slots: { default: !0 }
												});
											}
										),
											c(z, X));
									},
									$$slots: { default: !0 }
								}),
									c(j, ye));
							},
							$$slots: { default: !0 }
						}),
							s(Pe));
						var Le = n(Pe, 2),
							Ze = o(Le);
						{
							var Ge = (j) => {
									var C = wt();
									(A(() => {
										(Q(C, 'src', e(D)), Q(C, 'alt', e(m).name));
									}),
										c(j, C));
								},
								He = (j) => {
									var C = Fe(),
										ye = U(C);
									{
										var _e = (z) => {
												var T = $t(),
													X = o(T);
												(s(T),
													A(() => {
														(Q(X, 'src', e(D)), Q(X, 'type', e(m).type));
													}),
													c(z, T));
											},
											Ee = (z) => {
												var T = kt();
												(A(() => u(T, 'icon', e(G))), u(T, 'width', '48'), ge(T, 1, 'opacity-50'), c(z, T));
											};
										ie(
											ye,
											(z) => {
												e(m).type?.startsWith('audio/') && e(D) ? z(_e) : z(Ee, !1);
											},
											!0
										);
									}
									c(j, C);
								};
							ie(Ze, (j) => {
								e(m).type?.startsWith('image/') && e(D) ? j(Ge) : j(He, !1);
							});
						}
						s(Le);
						var ue = n(Le, 2),
							Ye = o(ue, !0);
						s(ue);
						var Se = n(ue, 2),
							ve = o(Se),
							me = o(ve);
						(A(() => u(me, 'icon', e(G))), u(me, 'width', '12'), u(me, 'height', '12'));
						var Ce = n(me, 2),
							Qe = o(Ce, !0);
						(s(Ce), s(ve));
						var Be = n(ve, 2),
							Ie = o(Be),
							et = o(Ie, !0);
						(s(Ie),
							ee(),
							s(Be),
							s(Se),
							s(Ue),
							A(
								(j, C) => {
									(Q(ue, 'title', e(m).name), Y(Ye, e(m).name), Q(ve, 'title', e(m).type), Y(Qe, j), Y(et, C));
								},
								[() => ce(e(m).type), () => (e(m).size / 1024).toFixed(2)]
							),
							c($, Ue));
					}
				);
				var l = n(b, 2);
				l.__click = () => e(g)?.click();
				var y = o(l);
				(u(y, 'icon', 'mingcute:add-fill'), u(y, 'width', '32'), ge(y, 1, 'text-tertiary-500 dark:text-primary-500'), ee(2), s(l), s(a));
				var p = n(a, 2);
				((p.__change = I),
					Te(
						p,
						($) => _(g, $),
						() => e(g)
					));
				var M = n(p, 2),
					F = o(M);
				F.__click = w;
				var x = n(F, 2);
				x.__click = pe;
				var Oe = o(x);
				{
					var Je = ($) => {
							var m = Pt(),
								K = U(m);
							(u(K, 'icon', 'eos-icons:loading'), ge(K, 1, 'animate-spin'));
							var D = n(K, 2),
								G = o(D);
							(s(D), A(() => Y(G, `Uploading... ${e(L) ?? ''}%`)), c($, m));
						},
						Ve = ($) => {
							var m = Lt(),
								K = U(m);
							u(K, 'icon', 'mingcute:check-fill');
							var D = n(K, 2),
								G = o(D);
							(s(D), A(() => Y(G, `Upload ${e(d).length ?? ''} File${e(d).length !== 1 ? 's' : ''}`)), c($, m));
						};
					ie(Oe, ($) => {
						e(R) ? $(Je) : $(Ve, !1);
					});
				}
				(s(x), s(M), s(i), A(() => (x.disabled = e(R))), c(t, r));
			};
		ie(W, (t) => {
			e(d).length === 0 ? t(V) : t(oe, !1);
		});
	}
	var ke = n(W, 2);
	{
		var S = (t) => {
			var r = Rt(),
				i = o(r),
				a = o(i);
			s(i);
			var b = n(i, 2),
				l = o(b),
				y = o(l);
			(s(l),
				s(b),
				s(r),
				A(
					(p) => {
						(pt(a, `width: ${e(L) ?? ''}%`), Y(y, `Speed: ${p ?? ''}/s`));
					},
					[() => N(e(E))]
				),
				c(t, r));
		};
		ie(ke, (t) => {
			e(R) && t(S);
		});
	}
	(c(te, fe), je());
}
ze(['click', 'change']);
var Mt = f(
	'<div class="space-y-4"><textarea placeholder="Paste Remote URLs here, one per line..." rows="6" class="textarea w-full bg-secondary-50 dark:bg-secondary-800"></textarea> <button class="preset-filled-tertiary-500 btn mt-2 dark:preset-filled-primary-500">Upload URLs</button></div>'
);
function Dt(te, re) {
	De(re, !0);
	let d = B(he([]));
	function g(h) {
		const v = h.target;
		v &&
			_(
				d,
				v.value
					.split(
						`
`
					)
					.filter((k) => k.trim() !== ''),
				!0
			);
	}
	async function P() {
		if (e(d).length === 0) {
			Me('No URLs entered for upload', 'warning');
			return;
		}
		const h = new FormData();
		h.append('remoteUrls', JSON.stringify(e(d)));
		try {
			const v = await fetch('?/remoteUpload', { method: 'POST', body: h });
			if (!v.ok) throw Error('Upload failed');
			const k = await v.json();
			if (k.success) (Me('URLs uploaded successfully', 'success'), _(d, [], !0));
			else throw Error(k.error || 'Upload failed');
		} catch (v) {
			(we.error('Error uploading URLs:', v), Me('Error uploading URLs: ' + (v instanceof Error ? v.message : 'Unknown error'), 'error'));
		}
	}
	var L = Mt(),
		E = o(L);
	(dt(E), (E.__input = g));
	var R = n(E, 2);
	((R.__click = P),
		s(L),
		_t(
			E,
			() => e(d),
			(h) => _(d, h)
		),
		c(te, L),
		je());
}
ze(['input', 'click']);
var jt = f(
		'<div class="flex items-center justify-center gap-2 py-4"><iconify-icon></iconify-icon> <p class="text-tertiary-500 dark:text-primary-500">Local Upload</p></div>',
		2
	),
	zt = f(
		'<div class="flex items-center justify-center gap-2 py-4"><iconify-icon></iconify-icon> <p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p></div>',
		2
	),
	At = f('<!> <!> <!>', 1),
	Ot = f('<div class="p-4"><!></div>'),
	St = f('<div class="p-4"><!></div>'),
	Ct = f('<!> <!> <!>', 1),
	Bt = f(
		'<div class="mb-4 flex items-center justify-between"><!> <button aria-label="Back" class="preset-outlined-tertiary-500 btn-icon rounded-full dark:preset-outlined-primary-500"><iconify-icon></iconify-icon></button></div> <div class="wrapper"><!></div>',
		3
	);
function ir(te, re) {
	De(re, !0);
	let d = B('0');
	var g = Bt(),
		P = U(g),
		L = o(P);
	{
		let k = xe(() => ft());
		ut(L, {
			get name() {
				return e(k);
			},
			icon: 'bi:images',
			iconColor: 'text-tertiary-500 dark:text-primary-500'
		});
	}
	var E = n(L, 2);
	E.__click = () => history.back();
	var R = o(E);
	(u(R, 'icon', 'ri:arrow-left-line'), u(R, 'width', '20'), s(E), s(P));
	var h = n(P, 2),
		v = o(h);
	(Z(v, {
		get value() {
			return e(d);
		},
		onValueChange: (k) => _(d, k.value, !0),
		children: (k, Ae) => {
			var le = Ct(),
				ce = U(le);
			O(
				ce,
				() => Z.List,
				(I, q) => {
					q(I, {
						class: 'flex border-b border-surface-200-800 font-bold',
						children: (J, de) => {
							var w = At(),
								N = U(w);
							O(
								N,
								() => Z.Trigger,
								(W, V) => {
									V(W, {
										value: '0',
										class: 'flex-1',
										children: (oe, ke) => {
											var S = jt(),
												t = o(S);
											(u(t, 'icon', 'material-symbols:database'), u(t, 'width', '28'), ee(2), s(S), c(oe, S));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var pe = n(N, 2);
							O(
								pe,
								() => Z.Trigger,
								(W, V) => {
									V(W, {
										value: '1',
										class: 'flex-1',
										children: (oe, ke) => {
											var S = zt(),
												t = o(S);
											(u(t, 'icon', 'arcticons:tautulli-remote'), u(t, 'width', '28'), ee(2), s(S), c(oe, S));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var fe = n(pe, 2);
							(O(
								fe,
								() => Z.Indicator,
								(W, V) => {
									V(W, {});
								}
							),
								c(J, w));
						},
						$$slots: { default: !0 }
					});
				}
			);
			var ae = n(ce, 2);
			O(
				ae,
				() => Z.Content,
				(I, q) => {
					q(I, {
						value: '0',
						children: (J, de) => {
							var w = Ot(),
								N = o(w);
							(Tt(N, {}), s(w), c(J, w));
						},
						$$slots: { default: !0 }
					});
				}
			);
			var $e = n(ae, 2);
			(O(
				$e,
				() => Z.Content,
				(I, q) => {
					q(I, {
						value: '1',
						children: (J, de) => {
							var w = St(),
								N = o(w);
							(Dt(N, {}), s(w), c(J, w));
						},
						$$slots: { default: !0 }
					});
				}
			),
				c(k, le));
		},
		$$slots: { default: !0 }
	}),
		s(h),
		c(te, g),
		je());
}
ze(['click']);
export { ir as component };
//# sourceMappingURL=22.C5izFgMv.js.map
