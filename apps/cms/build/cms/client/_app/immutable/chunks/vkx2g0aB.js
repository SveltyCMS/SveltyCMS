import {
	p as Le,
	d as W,
	x as ie,
	f as Yt,
	a as ze,
	b as D,
	g as a,
	u as ee,
	c as l,
	s as h,
	r as o,
	t as F,
	n as ve,
	ai as gt,
	e as Zt
} from './DrlZFkx8.js';
import { l as le } from './BvngfGKt.js';
import { I as re } from './DOA-aSm7.js';
import { i as we } from './zi73tRJP.js';
import { o as ei } from './CMZtchEj.js';
import { d as ti, c as ii, a as G, f as z, s as X } from './CTjXDULS.js';
import { e as de, i as bt } from './BXe5mj2j.js';
import { t as Ee, f as ft, s as ai } from './0XeaN6pZ.js';
import { r as ri, b as N, a as Y, c as Ae, d as si, e as vt } from './MEFvoR_D.js';
import { b as oi } from './D4QnGYgQ.js';
import { p as pe } from './DePHBZW_.js';
import { a as A } from './PsFRGuNZ.js';
import { s as Z } from './BSPmpUse.js';
import { I as r, T as k } from './-vmR0Fky.js';
import {
	v as ni,
	a as f,
	x as Fe,
	m as E,
	s as u,
	j as li,
	h as K,
	t as ye,
	q as $e,
	o as S,
	y as di,
	z as Ve,
	A as ae,
	B as Ue,
	C as Oe,
	n as ce,
	r as Ie,
	b as He,
	c as Je,
	e as ht,
	D as Ge
} from './Bg__saH3.js';
import {
	bH as ci,
	bI as ui,
	bJ as pi,
	bK as mi,
	bL as gi,
	bM as fi,
	bN as hi,
	bO as _i,
	bP as bi,
	bQ as vi,
	bR as wi,
	bS as yi,
	bT as Si,
	bU as qi,
	bV as xi,
	bW as Di,
	bX as Ci,
	bY as Ni
} from './N8Jg0v49.js';
import { c as wt } from './-PV6rnhC.js';
var Pi = z(
		'<div class="rounded-lg border-l-4 border-error-500 bg-error-50 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert"><div class="flex items-start gap-3"><span class="text-2xl" role="img" aria-label="Error">⚠️</span> <div class="flex-1"><p class="font-semibold">Error</p> <p class="mt-1 text-sm"> </p></div> <button class="preset-outlined-error-500 btn-sm" aria-label="Dismiss error">Dismiss</button></div></div>'
	),
	$i = z(
		'<div class="flex gap-1"><button class="preset-filled-success-500 btn-sm"><iconify-icon></iconify-icon> ✓</button> <button class="preset-filled-error-500 btn-sm"><iconify-icon></iconify-icon> ✗</button></div>',
		2
	),
	Ii = z(
		'<div class="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20"><h3 class="mb-3 text-sm font-semibold">Bulk Actions</h3> <div class="flex flex-wrap gap-2"></div></div>'
	),
	Oi = z(
		'<th scope="col" class="px-4 py-3 text-center"><div class="flex flex-col items-center gap-1"><iconify-icon></iconify-icon> <span class="text-xs"> </span></div></th>',
		2
	),
	ki = z('<span class="badge preset-filled-primary-500 text-xs">Admin</span>'),
	Ti = z('<span class="text-xs text-surface-600 dark:text-surface-50"> </span>'),
	ji = z('<td class="px-4 py-3 text-center"><button><iconify-icon></iconify-icon></button></td>', 2),
	Mi = z('<option> </option>'),
	Wi = z(
		'<tr class="border-t border-surface-200 dark:text-surface-50"><th scope="row" class="px-4 py-3"><div class="flex flex-col gap-1"><div class="flex items-center gap-2"><span class="font-semibold"> </span> <!></div> <!> <span class="text-xs font-medium text-primary-500"> </span></div></th><!><td class="px-4 py-3 text-center"><div class="flex justify-center gap-1"><button class="preset-outlined-primary-500 btn-sm" title="Enable all">✓ All</button> <button class="preset-outlined-error-500 btn-sm" title="Disable all">✗ All</button> <select class="input w-auto px-2 py-1 text-xs"><option>Preset...</option><!></select></div></td></tr>'
	),
	Ri = z(
		'<div class="flex flex-col items-center gap-3 rounded-lg bg-surface-50 py-12 text-center dark:bg-surface-800"><iconify-icon></iconify-icon> <p class="text-surface-600 dark:text-surface-50">No roles match your search for "<span class="font-medium"> </span>"</p></div>',
		2
	),
	Ei = z(
		'<div class="flex flex-col gap-4" role="region" aria-label="Permission settings"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex-1"><input placeholder="Search roles..." class="input w-full" type="search" aria-label="Search roles"/></div> <div class="flex flex-wrap gap-2"><button class="preset-outlined-surface-500btn btn-sm" title="Undo" aria-label="Undo last change"><iconify-icon></iconify-icon></button> <button class="preset-outlined-surface-500btn btn-sm" title="Redo" aria-label="Redo last change"><iconify-icon></iconify-icon></button> <button class="preset-outlined-primary-500 btn-sm"><iconify-icon></iconify-icon> Bulk Actions</button> <button class="preset-outlined-primary-500 btn-sm" title="Export permissions" aria-label="Export permissions as JSON"><iconify-icon></iconify-icon></button> <label class="preset-outlined-warning-500 btn-sm cursor-pointer"><iconify-icon></iconify-icon> <input type="file" accept=".json" class="hidden" aria-label="Import permissions from JSON"/></label></div></div> <!> <div class="overflow-x-auto rounded-lg border border-surface-200 dark:text-surface-50"><table class="table w-full" role="grid"><thead><tr><th scope="col" class="px-4 py-3 text-left"><div class="flex items-center gap-2">Role <span class="text-xs font-normal opacity-70"> </span></div></th><!><th scope="col" class="px-4 py-3 text-center">Actions</th></tr></thead><tbody></tbody></table></div> <!></div>',
		2
	);
function me(e, t) {
	Le(t, !0);
	const i = pe(t, 'permissions', 19, () => ({})),
		s = pe(t, 'roles', 19, () => []),
		n = pe(t, 'onUpdate', 3, () => {});
	let p = W(null),
		c = W(''),
		y = W(!1),
		x = W(!1),
		j = W(-1),
		C = W(ie([]));
	const _ = {
			[A.CREATE]: 'bi:plus-circle-fill',
			[A.READ]: 'bi:eye-fill',
			[A.WRITE]: 'bi:pencil-square',
			[A.UPDATE]: 'bi:pencil-fill',
			[A.DELETE]: 'bi:trash-fill',
			[A.MANAGE]: 'bi:gear-fill',
			[A.ACCESS]: 'bi:key-fill',
			[A.EXECUTE]: 'bi:play-fill',
			[A.SHARE]: 'bi:share-fill'
		},
		q = {
			'read-only': {
				name: 'Read Only',
				description: 'Can only view content',
				permissions: { read: !0, access: !0, create: !1, write: !1, update: !1, delete: !1, manage: !1, execute: !1, share: !1 }
			},
			editor: {
				name: 'Editor',
				description: 'Can create and edit content',
				permissions: { read: !0, access: !0, create: !0, write: !0, update: !0, share: !0, delete: !1, manage: !1, execute: !1 }
			},
			admin: {
				name: 'Administrator',
				description: 'Full access to everything',
				permissions: Object.fromEntries(Object.values(A).map((d) => [d, !0]))
			}
		};
	function P(d, b) {
		const v = { ...d };
		return (
			b.forEach((w) => {
				v[w._id] || (v[w._id] = Object.fromEntries(Object.values(A).map((H) => [H, !0])));
			}),
			v
		);
	}
	let m = ee(() => P(i(), s()));
	function M() {
		const d = a(C).slice(0, a(j) + 1);
		(d.push(JSON.parse(JSON.stringify(a(m)))), D(C, d, !0), D(j, d.length - 1));
	}
	function $t() {
		a(j) > 0 && (gt(j, -1), D(m, JSON.parse(JSON.stringify(a(C)[a(j)]))), se());
	}
	function It() {
		a(j) < a(C).length - 1 && (gt(j), D(m, JSON.parse(JSON.stringify(a(C)[a(j)]))), se());
	}
	const Ot = ee(() => a(j) > 0),
		kt = ee(() => a(j) < a(C).length - 1);
	function Tt(d, b) {
		if (s().find((w) => w._id === d)?.isAdmin) {
			Z('Cannot modify permissions for admin role', 'warning');
			return;
		}
		(a(m)[d] || (a(m)[d] = {}), (a(m)[d][b] = !a(m)[d][b]), M(), se());
	}
	function Be(d, b) {
		const v = s().find((w) => w._id === d);
		if (v?.isAdmin) {
			Z('Cannot modify permissions for admin role', 'warning');
			return;
		}
		((a(m)[d] = Object.fromEntries(Object.values(A).map((w) => [w, b]))),
			M(),
			se(),
			Z(`All permissions ${b ? 'enabled' : 'disabled'} for ${v?.name}`, 'success'));
	}
	function Xe(d, b) {
		(s().forEach((v) => {
			v.isAdmin || (a(m)[v._id][d] = b);
		}),
			M(),
			se(),
			Z(`${d} ${b ? 'enabled' : 'disabled'} for all roles`, 'success'));
	}
	function jt(d, b) {
		const v = s().find((H) => H._id === d);
		if (v?.isAdmin) {
			Z('Cannot modify permissions for admin role', 'warning');
			return;
		}
		const w = q[b];
		w && ((a(m)[d] = { ...w.permissions }), M(), se(), Z(`Applied "${w.name}" preset to ${v?.name}`, 'success'));
	}
	function se() {
		const d = Object.entries(a(m)).reduce((b, [v, w]) => (Object.values(w).some((ue) => ue === !1) && (b[v] = w), b), {});
		n()(d);
	}
	function Mt() {
		const d = JSON.stringify(a(m), null, 2),
			b = new Blob([d], { type: 'application/json' }),
			v = URL.createObjectURL(b),
			w = document.createElement('a');
		((w.href = v),
			(w.download = `permissions-${new Date().toISOString().split('T')[0]}.json`),
			w.click(),
			URL.revokeObjectURL(v),
			Z('Permissions exported', 'success'));
	}
	async function Wt(d) {
		const v = d.target.files?.[0];
		if (v)
			try {
				const w = await v.text(),
					H = JSON.parse(w);
				(D(m, { ...a(m), ...H }), M(), se(), Z('Permissions imported successfully', 'success'));
			} catch {
				(Z('Failed to import permissions', 'error'), D(p, 'Invalid permissions file'));
			}
	}
	const ke = ee(() =>
		s().filter((d) => d.name.toLowerCase().includes(a(c).toLowerCase()) || d.description?.toLowerCase().includes(a(c).toLowerCase()))
	);
	function Rt(d) {
		return Object.values(a(m)[d] || {}).filter(Boolean).length;
	}
	const Et = ee(() => Object.values(A).length);
	ei(() => {
		const d = window.matchMedia('(prefers-reduced-motion: reduce)');
		D(x, d.matches, !0);
		const b = (v) => {
			D(x, v.matches, !0);
		};
		return (d.addEventListener('change', b), M(), () => d.removeEventListener('change', b));
	});
	var Ke = ii(),
		At = Yt(Ke);
	{
		var Ft = (d) => {
				var b = Pi(),
					v = l(b),
					w = h(l(v), 2),
					H = h(l(w), 2),
					ue = l(H, !0);
				(o(H), o(w));
				var oe = h(w, 2);
				((oe.__click = () => D(p, null)),
					o(v),
					o(b),
					F(() => X(ue, a(p))),
					Ee(
						3,
						b,
						() => ft,
						() => ({ duration: a(x) ? 0 : 200 })
					),
					G(d, b));
			},
			Gt = (d) => {
				var b = Ei(),
					v = l(b),
					w = l(v),
					H = l(w);
				(ri(H), o(w));
				var ue = h(w, 2),
					oe = l(ue);
				oe.__click = $t;
				var Qe = l(oe);
				(N(Qe, 'icon', 'mdi:undo'), N(Qe, 'width', '18'), o(oe));
				var ge = h(oe, 2);
				ge.__click = It;
				var Ye = l(ge);
				(N(Ye, 'icon', 'mdi:redo'), N(Ye, 'width', '18'), o(ge));
				var fe = h(ge, 2);
				fe.__click = () => D(y, !a(y));
				var Ze = l(fe);
				(N(Ze, 'icon', 'mdi:cog-box'), N(Ze, 'width', '18'), ve(), o(fe));
				var qe = h(fe, 2);
				qe.__click = Mt;
				var et = l(qe);
				(N(et, 'icon', 'mdi:download'), N(et, 'width', '18'), o(qe));
				var tt = h(qe, 2),
					Te = l(tt);
				(N(Te, 'icon', 'mdi:upload'), N(Te, 'width', '18'));
				var Lt = h(Te, 2);
				((Lt.__change = Wt), o(tt), o(ue), o(v));
				var it = h(v, 2);
				{
					var zt = (R) => {
						var g = Ii(),
							L = h(l(g), 2);
						(de(
							L,
							20,
							() => Object.values(A),
							(V) => V,
							(V, $) => {
								var J = $i(),
									B = l(J);
								B.__click = () => Xe($, !0);
								var xe = l(B);
								(F(() => N(xe, 'icon', _[$])), N(xe, 'width', '16'), ve(), o(B));
								var ne = h(B, 2);
								ne.__click = () => Xe($, !1);
								var De = l(ne);
								(F(() => N(De, 'icon', _[$])),
									N(De, 'width', '16'),
									ve(),
									o(ne),
									o(J),
									F(() => {
										(Y(B, 'title', `Enable ${$} for all roles`),
											Y(B, 'aria-label', `Enable ${$} for all roles`),
											Y(ne, 'title', `Disable ${$} for all roles`),
											Y(ne, 'aria-label', `Disable ${$} for all roles`));
									}),
									G(V, J));
							}
						),
							o(L),
							o(g),
							Ee(
								3,
								g,
								() => ai,
								() => ({ duration: a(x) ? 0 : 200 })
							),
							G(R, g));
					};
					we(it, (R) => {
						a(y) && R(zt);
					});
				}
				var je = h(it, 2),
					at = l(je),
					Me = l(at),
					rt = l(Me),
					We = l(rt),
					st = l(We),
					ot = h(l(st)),
					Vt = l(ot);
				(o(ot), o(st), o(We));
				var Ut = h(We);
				(de(
					Ut,
					16,
					() => Object.values(A),
					(R) => R,
					(R, g) => {
						var L = Oi(),
							V = l(L),
							$ = l(V);
						(F(() => N($, 'icon', _[g])), N($, 'width', '20'), N($, 'aria-hidden', 'true'));
						var J = h($, 2),
							B = l(J, !0);
						(o(J), o(V), o(L), F(() => X(B, g)), G(R, L));
					}
				),
					ve(),
					o(rt),
					o(Me));
				var nt = h(Me);
				(de(
					nt,
					21,
					() => a(ke),
					(R) => R._id,
					(R, g) => {
						var L = Wi(),
							V = l(L),
							$ = l(V),
							J = l($),
							B = l(J),
							xe = l(B, !0);
						o(B);
						var ne = h(B, 2);
						{
							var De = (I) => {
								var O = ki();
								G(I, O);
							};
							we(ne, (I) => {
								a(g).isAdmin && I(De);
							});
						}
						o(J);
						var lt = h(J, 2);
						{
							var Bt = (I) => {
								var O = Ti(),
									te = l(O, !0);
								(o(O), F(() => X(te, a(g).description)), G(I, O));
							};
							we(lt, (I) => {
								a(g).description && I(Bt);
							});
						}
						var dt = h(lt, 2),
							Xt = l(dt);
						(o(dt), o($), o(V));
						var ct = h(V);
						de(
							ct,
							16,
							() => Object.values(A),
							(I) => I,
							(I, O) => {
								var te = ji(),
									Q = l(te);
								Q.__click = () => Tt(a(g)._id, O);
								var _e = l(Q);
								(F(() => N(_e, 'icon', (a(m)[a(g)._id]?.[O], 'mdi:check'))),
									N(_e, 'width', '18'),
									o(Q),
									o(te),
									F(() => {
										((Q.disabled = a(g).isAdmin),
											Y(Q, 'aria-label', `${a(m)[a(g)._id]?.[O] ? 'Disable' : 'Enable'} ${O} for ${a(g).name}`),
											Ae(
												Q,
												1,
												`btn-icon transition-all duration-200 ${a(m)[a(g)._id]?.[O] ? 'preset-filled-success-500 hover:scale-110' : 'preset-filled-error-500 opacity-50 hover:opacity-100 hover:scale-110'} ${a(g).isAdmin ? 'cursor-not-allowed opacity-30' : ''}`
											),
											Ae(_e, 1, si((a(m)[a(g)._id]?.[O], 'text-white'))));
									}),
									G(I, te));
							}
						);
						var ut = h(ct),
							pt = l(ut),
							Ce = l(pt);
						Ce.__click = () => Be(a(g)._id, !0);
						var Ne = h(Ce, 2);
						Ne.__click = () => Be(a(g)._id, !1);
						var he = h(Ne, 2);
						he.__change = (I) => {
							const O = I.target;
							O.value && (jt(a(g)._id, O.value), (O.value = ''));
						};
						var Re = l(he);
						Re.value = Re.__value = '';
						var Kt = h(Re);
						(de(
							Kt,
							17,
							() => Object.entries(q),
							([I, O]) => I,
							(I, O) => {
								var te = ee(() => Zt(a(O), 2));
								let Q = () => a(te)[0],
									_e = () => a(te)[1];
								var be = Mi(),
									Qt = l(be, !0);
								o(be);
								var mt = {};
								(F(() => {
									(X(Qt, _e().name), mt !== (mt = Q()) && (be.value = (be.__value = Q()) ?? ''));
								}),
									G(I, be));
							}
						),
							o(he),
							o(pt),
							o(ut),
							o(L),
							F(
								(I) => {
									(X(xe, a(g).name),
										X(Xt, `${I ?? ''}/${a(Et) ?? ''} enabled`),
										(Ce.disabled = a(g).isAdmin),
										Y(Ce, 'aria-label', `Enable all permissions for ${a(g).name}`),
										(Ne.disabled = a(g).isAdmin),
										Y(Ne, 'aria-label', `Disable all permissions for ${a(g).name}`),
										(he.disabled = a(g).isAdmin),
										Y(he, 'aria-label', `Apply preset to ${a(g).name}`));
								},
								[() => Rt(a(g)._id)]
							),
							G(R, L));
					}
				),
					o(nt),
					o(at),
					o(je));
				var Ht = h(je, 2);
				{
					var Jt = (R) => {
						var g = Ri(),
							L = l(g);
						(N(L, 'icon', 'mdi:magnify-close'), N(L, 'width', '48'), Ae(L, 1, 'text-surface-400'));
						var V = h(L, 2),
							$ = h(l(V)),
							J = l($, !0);
						(o($),
							ve(),
							o(V),
							o(g),
							F(() => X(J, a(c))),
							Ee(
								3,
								g,
								() => ft,
								() => ({ duration: a(x) ? 0 : 200 })
							),
							G(R, g));
					};
					we(Ht, (R) => {
						a(ke).length === 0 && R(Jt);
					});
				}
				(o(b),
					F(() => {
						((oe.disabled = !a(Ot)), (ge.disabled = !a(kt)), Y(fe, 'aria-expanded', a(y)), X(Vt, `(${a(ke).length ?? ''})`));
					}),
					oi(
						H,
						() => a(c),
						(R) => D(c, R)
					),
					G(d, b));
			};
		we(At, (d) => {
			a(p) ? d(Ft) : d(Gt, !1);
		});
	}
	(G(e, Ke), ze());
}
ti(['click', 'change']);
function T(e) {
	const t = {
			widgetId: e.Name,
			Name: e.Name,
			Icon: e.Icon,
			Description: e.Description,
			inputComponentPath: e.inputComponentPath || '',
			displayComponentPath: e.displayComponentPath || '',
			validationSchema: e.validationSchema,
			defaults: e.defaults,
			GuiFields: e.GuiSchema || {},
			aggregations: e.aggregations,
			getTranslatablePaths: e.getTranslatablePaths
		},
		i = (s) => {
			const n = { widget: t, label: s.label, db_fieldName: '', required: !1, translated: !1, width: void 0, helper: void 0, permissions: void 0 };
			if (e.defaults) {
				for (const p in e.defaults)
					if (Object.prototype.hasOwnProperty.call(e.defaults, p)) {
						const c = e.defaults[p];
						n[p] = c;
					}
			}
			for (const p in s)
				if (Object.prototype.hasOwnProperty.call(s, p)) {
					const c = s[p];
					c !== void 0 && (n[p] = c);
				}
			return (
				(n.required = n.required ?? !1),
				(n.translated = n.translated ?? !1),
				!n.db_fieldName && n.label
					? (n.db_fieldName = n.label
							.toLowerCase()
							.replace(/\s+/g, '_')
							.replace(/[^a-z0-9_]/g, ''))
					: n.db_fieldName || (n.db_fieldName = 'unnamed_field'),
				n
			);
		};
	return (
		(i.Name = e.Name),
		(i.Icon = e.Icon),
		(i.Description = e.Description),
		(i.GuiSchema = e.GuiSchema),
		(i.GraphqlSchema = e.GraphqlSchema),
		(i.aggregations = e.aggregations),
		(i.__inputComponentPath = e.inputComponentPath || ''),
		(i.__displayComponentPath = e.displayComponentPath || ''),
		(i.toString = () => ''),
		i
	);
}
const Ai = ni('Must be a boolean.'),
	yt = T({
		Name: 'Checkbox',
		Icon: 'tabler:checkbox',
		Description: ci(),
		inputComponentPath: '/src/widgets/core/Checkbox/Input.svelte',
		displayComponentPath: '/src/widgets/core/Checkbox/Display.svelte',
		validationSchema: Ai,
		defaults: { color: 'primary', size: 'md', translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			icon: { widget: re, required: !1 },
			helper: { widget: r, required: !1 },
			width: { widget: r, required: !1 },
			permissions: { widget: me, required: !1 }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => [{ $match: { [e.db_fieldName]: t === 'true' } }],
			sorts: async ({ field: e, sortDirection: t }) => ({ [e.db_fieldName]: t })
		},
		GraphqlSchema: () => ({ typeID: 'Boolean', graphql: '' })
	}),
	Fi = Object.freeze(Object.defineProperty({ __proto__: null, default: yt }, Symbol.toStringTag, { value: 'Module' })),
	Gi = f(u('A value is required.'), E(1, 'This date is required.'), Fe('The date must be a valid ISO 8601 string.')),
	Li = T({
		Name: 'Date',
		Icon: 'mdi:calendar',
		Description: ui(),
		inputComponentPath: '/src/widgets/core/Date/Input.svelte',
		displayComponentPath: '/src/widgets/core/Date/Display.svelte',
		validationSchema: Gi,
		defaults: { translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			icon: { widget: re, required: !1 },
			helper: { widget: r, required: !1 },
			width: { widget: r, required: !1 },
			permissions: { widget: me, required: !1 },
			minDate: { widget: r, required: !1 },
			maxDate: { widget: r, required: !1 },
			displayFormat: { widget: r, required: !1, placeholder: 'medium (short, medium, long, full)' }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => {
				const i = e.db_fieldName,
					[s, n] = t.split('_'),
					p = new Date(s);
				if ((p.setUTCHours(0, 0, 0, 0), isNaN(p.getTime()))) return [];
				if (n) {
					const y = new Date(n);
					if ((y.setUTCHours(23, 59, 59, 999), !isNaN(y.getTime()))) return [{ $match: { [i]: { $gte: p, $lte: y } } }];
				}
				const c = new Date(p);
				return (c.setUTCHours(23, 59, 59, 999), [{ $match: { [i]: { $gte: p, $lte: c } } }]);
			},
			sorts: async ({ field: e, sortDirection: t }) => ({ [e.db_fieldName]: t })
		},
		GraphqlSchema: () => ({ typeID: 'String', graphql: '' })
	}),
	zi = Object.freeze(Object.defineProperty({ __proto__: null, default: Li }, Symbol.toStringTag, { value: 'Module' })),
	Vi = f(
		K({ start: f(u(), E(1, 'Start date is required.'), Fe()), end: f(u(), E(1, 'End date is required.'), Fe()) }),
		li((e) => new Date(e.start) <= new Date(e.end), 'End date must be on or after the start date.')
	),
	Ui = T({
		Name: 'DateRange',
		Icon: 'mdi:calendar-range',
		Description: pi(),
		inputComponentPath: '/src/widgets/core/Daterange/Input.svelte',
		displayComponentPath: '/src/widgets/core/Daterange/Display.svelte',
		validationSchema: Vi,
		defaults: { translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			icon: { widget: re, required: !1 },
			helper: { widget: r, required: !1 },
			width: { widget: r, required: !1 },
			permissions: { widget: me, required: !1 }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => {
				const i = e.db_fieldName,
					s = new Date(t);
				return isNaN(s.getTime()) ? [] : [{ $match: { [`${i}.start`]: { $lte: s }, [`${i}.end`]: { $gte: s } } }];
			},
			sorts: async ({ field: e, sortDirection: t }) => ({ [`${e.db_fieldName}.start`]: t })
		}
	}),
	Hi = Object.freeze(Object.defineProperty({ __proto__: null, default: Ui }, Symbol.toStringTag, { value: 'Module' })),
	Ji = K({}),
	Bi = T({
		Name: 'Group',
		Icon: 'mdi:folder-outline',
		Description: 'Group related fields together',
		inputComponentPath: '/src/widgets/core/Group/Input.svelte',
		displayComponentPath: '/src/widgets/core/Group/Display.svelte',
		validationSchema: Ji,
		defaults: { collapsible: !1, collapsed: !1, variant: 'default' },
		GuiSchema: {
			label: { widget: r, required: !0 },
			groupTitle: { widget: r, required: !1 },
			collapsible: { widget: k, required: !1 },
			collapsed: { widget: k, required: !1 },
			variant: { widget: r, required: !1 },
			db_fieldName: { widget: r, required: !1 },
			icon: { widget: re, required: !1 },
			helper: { widget: r, required: !1 },
			width: { widget: r, required: !1 },
			permissions: { widget: me, required: !1 }
		},
		aggregations: {}
	}),
	Xi = Object.freeze(Object.defineProperty({ __proto__: null, default: Bi }, Symbol.toStringTag, { value: 'Module' })),
	St = (e) => {
		const t = [ye((s) => (typeof s == 'string' ? s.trim() : s))];
		(e.required && t.push(E(1, 'This field is required.')),
			e.minLength && t.push(E(e.minLength, `Must be at least ${e.minLength} characters.`)),
			e.maxLength && t.push($e(e.maxLength, `Must be no more than ${e.maxLength} characters.`)));
		const i = f(u(), ...t);
		return e.translated ? S(di(u(), u()), {}) : e.required ? i : S(i, '');
	},
	Se = T({
		Name: 'Input',
		Icon: 'mdi:form-textbox',
		Description: mi(),
		inputComponentPath: '/src/widgets/core/Input/Input.svelte',
		displayComponentPath: '/src/widgets/core/Input/Display.svelte',
		validationSchema: St,
		defaults: { translated: !0 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			translated: { widget: k, required: !1 },
			icon: { widget: re, required: !1 },
			helper: { widget: r, required: !1 },
			width: { widget: r, required: !1 },
			permissions: { widget: me, required: !1 },
			placeholder: { widget: r, required: !1 },
			minLength: { widget: r, required: !1 },
			maxLength: { widget: r, required: !1 },
			prefix: { widget: r, required: !1 },
			suffix: { widget: r, required: !1 },
			count: { widget: r, required: !1 }
		},
		aggregations: {
			filters: async ({ field: e, filter: t, contentLanguage: i }) => [{ $match: { [`${e.db_fieldName}.${i}`]: { $regex: t, $options: 'i' } } }],
			sorts: async ({ field: e, sortDirection: t, contentLanguage: i }) => ({ [`${e.db_fieldName}.${i}`]: t })
		},
		GraphqlSchema: () => ({ typeID: 'String', graphql: '' })
	}),
	Ki = Object.freeze(Object.defineProperty({ __proto__: null, createValidationSchema: St, default: Se }, Symbol.toStringTag, { value: 'Module' })),
	qt = (e) => {
		const t = f(u(), E(1, 'A media file is required.'));
		if (e.multiupload) {
			const i = Ve(t);
			return e.required ? f(i, E(1, 'At least one media file is required.')) : S(i);
		}
		return e.required ? t : S(t, '');
	},
	Qi = T({
		Name: 'MediaUpload',
		Icon: 'mdi:image-multiple',
		Description: gi(),
		inputComponentPath: '/src/widgets/core/MediaUpload/Input.svelte',
		displayComponentPath: '/src/widgets/core/MediaUpload/Display.svelte',
		validationSchema: qt,
		defaults: { multiupload: !1, allowedTypes: [] },
		GuiSchema: {
			multiupload: { widget: yt, label: 'Allow Multiple Files' },
			watermark: {
				widget: 'group',
				label: 'Watermark Options',
				fields: {
					text: { widget: Se, label: 'Watermark Text' },
					position: { widget: Se, label: 'Position (e.g., center, top-right)' },
					opacity: { widget: Se, label: 'Opacity (0-1)' },
					scale: { widget: Se, label: 'Scale (e.g., 0.5 for 50%)' }
				}
			}
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => [
				{ $lookup: { from: 'media_files', localField: e.db_fieldName, foreignField: '_id', as: 'media_docs' } },
				{ $match: { 'media_docs.name': { $regex: t, $options: 'i' } } }
			]
		}
	}),
	Yi = Object.freeze(Object.defineProperty({ __proto__: null, createValidationSchema: qt, default: Qi }, Symbol.toStringTag, { value: 'Module' })),
	Zi = K({ _id: f(u(), $e(100)), _fields: K({}), children: Ve(K({})) }),
	ea = Ve(Zi),
	ta = T({
		Name: 'MegaMenu',
		Icon: 'lucide:menu-square',
		Description: fi(),
		inputComponentPath: '/src/widgets/core/megamenu/Input.svelte',
		displayComponentPath: '/src/widgets/core/megamenu/Display.svelte',
		validationSchema: ea,
		defaults: { fields: [], maxDepth: 5, enableDragDrop: !0, enableExpandCollapse: !0 }
	}),
	xt = (e, t, i = 0, s) => {
		e.forEach((n) => {
			(t(n, i, s), n.children && n.children.length > 0 && xt(n.children, t, i + 1, n));
		});
	},
	ia = (e, t) => {
		let i = e,
			s = null;
		for (const n of t)
			if (n >= 0 && n < i.length) ((s = i[n]), (i = s.children));
			else return null;
		return s;
	},
	aa = (e, t) => {
		const i = [],
			s = t.maxDepth || 5,
			n = (c, y = 0) => {
				(y > s && i.push(`Menu item "${c._fields?.title || c._id}" exceeds maximum depth of ${s}`), c.children.forEach((x) => n(x, y + 1)));
			},
			p = (c) => {
				const y = c.children.length,
					x = t.validationRules?.maxChildrenPerParent;
				(x && y > x && i.push(`Menu item "${c._fields?.title || c._id}" has ${y} children, maximum allowed is ${x}`), c.children.forEach(p));
			};
		return (
			e.forEach((c) => {
				(n(c), p(c));
			}),
			{ valid: i.length === 0, errors: i }
		);
	},
	ra = Object.freeze(
		Object.defineProperty(
			{ __proto__: null, default: ta, findMenuItemByPath: ia, traverseMenuItems: xt, validateMenuStructure: aa },
			Symbol.toStringTag,
			{ value: 'Module' }
		)
	),
	sa = (e) => {
		const t = e.options?.map((s) => ae(s.value)) || [],
			i = Ue([...t], 'Please select a valid option.');
		return e.required ? i : S(i);
	},
	oa = T({
		Name: 'Radio',
		Icon: 'mdi:radiobox-marked',
		Description: hi(),
		inputComponentPath: '/src/widgets/core/Radio/Input.svelte',
		displayComponentPath: '/src/widgets/core/Radio/Display.svelte',
		validationSchema: sa,
		defaults: { options: [], translated: !1, legend: '' },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			legend: { widget: r, required: !1, helper: 'Legend text for the radio group' },
			options: { widget: r, required: !0, helper: "Enter an array of objects, e.g., [{label: 'First', value: 1}, {label: 'Second', value: 2}]" }
		},
		GraphqlSchema: () => ({ typeID: 'String', graphql: '' })
	}),
	na = Object.freeze(Object.defineProperty({ __proto__: null, default: oa }, Symbol.toStringTag, { value: 'Module' }));
var la = z('<option> </option>'),
	da = z(
		'<div class="m-1 flex max-w-full items-center justify-between gap-2"><label for="collection-select" class="w-32 flex-none">Collection</label> <select id="collection-select" class="input grow text-black dark:text-primary-500"><option>Select a collection</option><!></select></div>'
	);
function ca(e, t) {
	Le(t, !0);
	let i = pe(t, 'value', 15, '');
	const s = ee(() => Object.values(wt.all).map((x) => x.name));
	var n = da(),
		p = h(l(n), 2),
		c = l(p);
	c.value = c.__value = '';
	var y = h(c);
	(de(
		y,
		17,
		() => a(s),
		bt,
		(x, j) => {
			var C = la(),
				_ = l(C, !0);
			o(C);
			var q = {};
			(F(() => {
				(X(_, a(j)), q !== (q = a(j)) && (C.value = (C.__value = a(j)) ?? ''));
			}),
				G(x, C));
		}
	),
		o(p),
		o(n),
		vt(p, i),
		G(e, n),
		ze());
}
var ua = z('<option> </option>'),
	pa = z(
		'<div class="m-1 flex max-w-full items-center justify-between gap-2"><label for="field-select" class="w-32 flex-none">Display Field</label> <select id="field-select" class="input grow text-black dark:text-primary-500"><option>Select a field</option><!></select></div>'
	);
function ma(e, t) {
	Le(t, !0);
	let i = pe(t, 'value', 15, ''),
		s = pe(t, 'collection', 3, '');
	const n = ee(() => Object.values(wt.all).find((C) => C.name === s())),
		p = ee(
			() =>
				a(n)
					?.fields?.map((C) => C.db_fieldName)
					.filter(Boolean) || []
		);
	var c = pa(),
		y = h(l(c), 2),
		x = l(y);
	x.value = x.__value = '';
	var j = h(x);
	(de(
		j,
		17,
		() => a(p),
		bt,
		(C, _) => {
			var q = ua(),
				P = l(q, !0);
			o(q);
			var m = {};
			(F(() => {
				(X(P, a(_)), m !== (m = a(_)) && (q.value = (q.__value = a(_)) ?? ''));
			}),
				G(C, q));
		}
	),
		o(y),
		o(c),
		F(() => (y.disabled = !s())),
		vt(y, i),
		G(e, c),
		ze());
}
const ga = (e) => {
		const t = f(u(), E(1, 'An entry must be selected.'));
		return e.required ? t : S(t, '');
	},
	fa = T({
		Name: 'Relation',
		Icon: 'mdi:relation-one-to-one',
		Description: _i(),
		inputComponentPath: '/src/widgets/core/Relation/Input.svelte',
		displayComponentPath: '/src/widgets/core/Relation/Display.svelte',
		validationSchema: ga,
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			icon: { widget: re, required: !1 },
			helper: { widget: r, required: !1 },
			width: { widget: r, required: !1 },
			permissions: { widget: me, required: !1 },
			collection: { widget: ca, required: !0 },
			displayField: { widget: ma, required: !0 }
		},
		defaults: { translated: !1 },
		aggregations: {
			filters: async ({ field: e, filter: t, tenantId: i }) => [
				{ $lookup: { from: e.collection, localField: e.db_fieldName, foreignField: '_id', as: 'related_doc' } },
				{ $match: { ...(i ? { 'related_doc.tenantId': i } : {}), [`related_doc.${e.displayField}`]: { $regex: t, $options: 'i' } } }
			],
			sorts: async ({ field: e, sortDirection: t }) => ({ [`${e.db_fieldName}.${e.displayField}`]: t })
		},
		GraphqlSchema: () => ({ typeID: 'String', graphql: '' })
	}),
	ha = Object.freeze(Object.defineProperty({ __proto__: null, default: fa }, Symbol.toStringTag, { value: 'Module' })),
	_a = (e) => {
		if (!e) return '';
		let t,
			i = e;
		do ((t = i), (i = i.replace(/<[^>]*>/g, '')));
		while (i !== t);
		return ((i = i.replace(/[<>]/g, '')), i);
	},
	ba = (e) => (e ? _a(e).trim().length === 0 : !0),
	va = (e) => {
		const t = K({ title: S(u()), content: u() });
		return e.required
			? K({
					title: S(u()),
					content: f(
						u(),
						Oe((i) => !ba(i), 'Content is required.')
					)
				})
			: S(t);
	},
	wa = T({
		Name: 'RichText',
		Icon: 'mdi:format-pilcrow-arrow-right',
		Description: bi(),
		inputComponentPath: '/src/widgets/core/RichText/Input.svelte',
		displayComponentPath: '/src/widgets/core/RichText/Display.svelte',
		validationSchema: va,
		defaults: { toolbar: ['bold', 'italic', 'headings', 'lists', 'link', 'image', 'align', 'clear'], translated: !0 }
	}),
	ya = Object.freeze(Object.defineProperty({ __proto__: null, default: wa }, Symbol.toStringTag, { value: 'Module' })),
	Sa = K({
		street: f(u(), E(1, 'Street is required.')),
		houseNumber: u(),
		postalCode: f(u(), E(1, 'Postal code is required.')),
		city: f(u(), E(1, 'City is required.')),
		country: f(u(), E(2, 'Country is required.')),
		latitude: ce(),
		longitude: ce()
	}),
	qa = T({
		Name: 'Address',
		Icon: 'mdi:home-map-marker',
		Description: vi(),
		inputComponentPath: '/src/widgets/custom/Address/Input.svelte',
		displayComponentPath: '/src/widgets/custom/Address/Display.svelte',
		validationSchema: Sa,
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			width: { widget: r, required: !1 },
			defaultCountry: { widget: r, required: !1, helper: "Default 2-letter country code (e.g., 'DE', 'US')." },
			mapCenter: { widget: r, required: !1, helper: "Default map center (e.g., '51.34,6.57')." },
			zoom: { widget: r, required: !1, helper: 'Default map zoom level (e.g., 12).' },
			hiddenFields: { widget: r, required: !1, helper: "Comma-separated list of fields to hide (e.g., 'latitude,longitude')." }
		},
		defaults: { mapCenter: { lat: 51.34, lng: 6.57 }, zoom: 12, defaultCountry: 'DE', hiddenFields: [], translated: !1 },
		getTranslatablePaths: (e) => [`${e}.street`, `${e}.postalCode`, `${e}.city`, `${e}.country`]
	}),
	xa = Object.freeze(Object.defineProperty({ __proto__: null, default: qa }, Symbol.toStringTag, { value: 'Module' })),
	Da = (e) => {
		const t = f(u(), Ie(/^#[0-9a-f]{6}$/i, 'Must be a valid 6-digit hex code (e.g., #FF5733).'));
		return e.required ? f(u(), E(1, 'A color is required.'), t) : S(t, '');
	},
	Ca = T({
		Name: 'ColorPicker',
		Icon: 'ic:outline-colorize',
		Description: wi(),
		inputComponentPath: '/src/widgets/custom/ColorPicker/Input.svelte',
		displayComponentPath: '/src/widgets/custom/ColorPicker/Display.svelte',
		validationSchema: Da,
		defaults: { translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			width: { widget: r, required: !1 }
		}
	}),
	Na = Object.freeze(Object.defineProperty({ __proto__: null, default: Ca }, Symbol.toStringTag, { value: 'Module' })),
	Pa = (e) => {
		const t = [];
		(e.minValue !== void 0 && t.push(He(e.minValue, `Value must be at least ${e.minValue}.`)),
			e.maxValue !== void 0 && t.push(Je(e.maxValue, `Value must not exceed ${e.maxValue}.`)));
		const i = ce('Value must be a number.'),
			s = t.length > 0 ? f(i, ...t) : i;
		return e.required ? s : S(s);
	},
	$a = T({
		Name: 'Currency',
		Icon: 'mdi:currency-usd',
		Description: yi(),
		inputComponentPath: '/src/widgets/custom/Currency/Input.svelte',
		displayComponentPath: '/src/widgets/custom/Currency/Display.svelte',
		validationSchema: Pa,
		defaults: { currencyCode: 'EUR', translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			currencyCode: { widget: r, required: !0, helper: 'ISO 4217 code (USD, EUR, GBP, etc.)', pattern: '^[A-Z]{3}$' },
			minValue: { widget: r, required: !1 },
			maxValue: { widget: r, required: !1 },
			placeholder: { widget: r, required: !1 }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => [{ $match: { [e.db_fieldName]: { $eq: parseFloat(t) } } }],
			sorts: async ({ field: e, sortDirection: t }) => ({ [e.db_fieldName]: t })
		},
		GraphqlSchema: () => ({ typeID: 'Float', graphql: '' })
	}),
	Ia = Object.freeze(Object.defineProperty({ __proto__: null, default: $a }, Symbol.toStringTag, { value: 'Module' })),
	Oa = ['tempmail.com', 'guerrillamail.com', '10minutemail.com', 'mailinator.com', 'throwaway.email', 'yopmail.com', 'temp-mail.org', 'getnada.com'],
	_t = Oe((e) => {
		if (typeof e != 'string') return !1;
		const t = e.split('@')[1]?.toLowerCase();
		return !Oa.includes(t);
	}, 'Disposable email addresses are not allowed'),
	ka = (e) => {
		const t = f(u(), ht('Please enter a valid email address.'), _t),
			i = e.required ? f(u(), E(1, 'This field is required.'), ht('Please enter a valid email address.'), _t) : t;
		return e.required ? i : S(i, '');
	},
	Ta = T({
		Name: 'Email',
		Icon: 'ic:outline-email',
		Description: Si(),
		inputComponentPath: '/src/widgets/custom/Email/Input.svelte',
		displayComponentPath: '/src/widgets/custom/Email/Display.svelte',
		validationSchema: ka,
		defaults: { translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			placeholder: { widget: r, required: !1 }
		},
		GraphqlSchema: () => ({ typeID: 'String', graphql: '' })
	}),
	ja = Object.freeze(Object.defineProperty({ __proto__: null, default: Ta }, Symbol.toStringTag, { value: 'Module' })),
	Ma = (e) => {
		const t = [];
		(e.min !== void 0 && t.push(He(e.min, `Value must be at least ${e.min}.`)),
			e.max !== void 0 && t.push(Je(e.max, `Value must not exceed ${e.max}.`)));
		const i = ce('Value must be a number.'),
			s = t.length > 0 ? f(i, ...t) : i;
		return e.required ? s : S(s);
	},
	Wa = T({
		Name: 'Number',
		Icon: 'mdi:numeric',
		Description: qi(),
		inputComponentPath: '/src/widgets/custom/Number/Input.svelte',
		displayComponentPath: '/src/widgets/custom/Number/Display.svelte',
		validationSchema: Ma,
		defaults: { step: 1, translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			min: { widget: r, required: !1, helper: 'Minimum allowed value.' },
			max: { widget: r, required: !1, helper: 'Maximum allowed value.' },
			step: { widget: r, required: !1, helper: 'Stepping interval.' },
			placeholder: { widget: r, required: !1 }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => [{ $match: { [e.db_fieldName]: { $eq: parseFloat(t) } } }],
			sorts: async ({ field: e, sortDirection: t }) => ({ [e.db_fieldName]: t })
		},
		GraphqlSchema: () => ({ typeID: 'Float', graphql: '' })
	}),
	Ra = Object.freeze(Object.defineProperty({ __proto__: null, default: Wa }, Symbol.toStringTag, { value: 'Module' })),
	Ea = (e) => {
		const t = /^\+[1-9]\d{1,3}[\d\s-]{4,14}$/,
			i = 'Please enter a valid international phone number (e.g., +49 123 456789)',
			s = e.pattern ? new RegExp(e.pattern) : t,
			n = f(u(), Ie(s, i)),
			p = e.required ? f(u(), E(1, 'This field is required.'), Ie(s, i)) : n;
		return e.required ? p : S(p, '');
	},
	Aa = T({
		Name: 'PhoneNumber',
		Icon: 'ic:baseline-phone-in-talk',
		Description: xi(),
		inputComponentPath: '/src/widgets/custom/PhoneNumber/Input.svelte',
		displayComponentPath: '/src/widgets/custom/PhoneNumber/Display.svelte',
		validationSchema: Ea,
		defaults: { translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			placeholder: { widget: r, required: !1 },
			pattern: { widget: r, required: !1, helper: 'Optional: Custom regex for validation.' }
		}
	}),
	Fa = Object.freeze(Object.defineProperty({ __proto__: null, default: Aa }, Symbol.toStringTag, { value: 'Module' })),
	Ga = (e) => {
		const t = e.max || 5,
			i = f(ce('Rating must be a number.'), He(1, 'A rating is required.'), Je(t, `Rating cannot exceed ${t}.`));
		return e.required ? i : S(i);
	},
	La = T({
		Name: 'Rating',
		Icon: 'material-symbols:star-outline',
		Description: Di(),
		inputComponentPath: '/src/widgets/custom/Rating/Input.svelte',
		displayComponentPath: '/src/widgets/custom/Rating/Display.svelte',
		validationSchema: Ga,
		defaults: { max: 5, iconFull: 'material-symbols:star', iconEmpty: 'material-symbols:star-outline', translated: !1 },
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			max: { widget: r, required: !1, helper: 'Maximum number of stars.' },
			iconFull: { widget: re, required: !1 },
			iconEmpty: { widget: re, required: !1 }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => [{ $match: { [e.db_fieldName]: { $eq: parseInt(t, 10) } } }],
			sorts: async ({ field: e, sortDirection: t }) => ({ [e.db_fieldName]: t })
		},
		GraphqlSchema: () => ({ typeID: 'Int', graphql: '' })
	}),
	za = Object.freeze(Object.defineProperty({ __proto__: null, default: La }, Symbol.toStringTag, { value: 'Module' })),
	Va = [
		/^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
		/^https?:\/\/(www\.)?vimeo\.com\/\d+$/,
		/^https?:\/\/(www\.)?twitch\.tv\/videos\/\d+$/,
		/^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+$/
	],
	Ua = K({
		platform: Ue([ae('youtube'), ae('vimeo'), ae('twitch'), ae('tiktok'), ae('other')]),
		url: f(
			u(),
			Ge('Must be a valid video URL.'),
			Oe((e) => {
				const t = e;
				return Va.some((i) => i.test(t));
			}, 'URL must be from an allowed video platform (YouTube, Vimeo, Twitch, or TikTok)')
		),
		videoId: f(u(), E(1, 'Video ID is required.')),
		title: f(u(), E(1, 'Video title is required.')),
		thumbnailUrl: f(u(), Ge('Must be a valid thumbnail URL.')),
		channelTitle: S(u()),
		duration: S(u()),
		width: S(ce()),
		height: S(ce()),
		publishedAt: S(u())
	}),
	Ha = Ua,
	Ja = T({
		Name: 'RemoteVideo',
		Icon: 'mdi:video-vintage',
		Description: Ci(),
		inputComponentPath: '/src/widgets/custom/RemoteVideo/Input.svelte',
		displayComponentPath: '/src/widgets/custom/RemoteVideo/Display.svelte',
		validationSchema: Ha,
		defaults: {
			placeholder: 'Enter video URL (YouTube, Vimeo, Twitch, TikTok)',
			allowedPlatforms: ['youtube', 'vimeo', 'twitch', 'tiktok'],
			translated: !1
		},
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			placeholder: { widget: r, required: !1 },
			allowedPlatforms: { widget: r, required: !1, helper: "Comma-separated platforms (e.g., 'youtube,vimeo')." }
		},
		aggregations: {
			filters: async ({ field: e, filter: t }) => [{ $match: { [`${e.db_fieldName}.title`]: { $regex: t, $options: 'i' } } }],
			sorts: async ({ field: e, sortDirection: t }) => ({ [`${e.db_fieldName}.title`]: t })
		},
		GraphqlSchema: ({ label: e }) => ({
			typeID: e,
			graphql: `
            type ${e} {
                platform: String!
                url: String!
                videoId: String!
                title: String!
                thumbnailUrl: String!
                channelTitle: String
                duration: String
                width: Int
                height: Int
                publishedAt: String
            }
        `
		})
	}),
	Ba = Object.freeze(Object.defineProperty({ __proto__: null, default: Ja }, Symbol.toStringTag, { value: 'Module' })),
	Pe = (e) => e.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'),
	Xa = K({
		title: f(u(), $e(60, 'Title should be under 60 characters.'), ye(Pe)),
		description: f(u(), $e(160, 'Description should be under 160 characters.'), ye(Pe)),
		focusKeyword: f(u(), ye(Pe)),
		robotsMeta: f(u(), ye(Pe)),
		canonicalUrl: S(f(u(), Ge('Must be a valid URL.'), Ie(/^https?:\/\//, 'Must use HTTP or HTTPS protocol'))),
		ogTitle: S(u()),
		ogDescription: S(u()),
		ogImage: S(u()),
		twitterCard: Ue([ae('summary'), ae('summary_large_image')]),
		twitterTitle: S(u()),
		twitterDescription: S(u()),
		twitterImage: S(u()),
		schemaMarkup: S(
			f(
				u(),
				Oe((e) => {
					if (!e) return !0;
					try {
						const t = JSON.parse(e);
						return typeof t == 'object' && !Array.isArray(t);
					} catch {
						return !1;
					}
				}, 'Must be valid JSON object')
			)
		)
	}),
	Ka = T({
		Name: 'SEO',
		Icon: 'tabler:seo',
		Description: Ni(),
		inputComponentPath: '/src/widgets/custom/Seo/Input.svelte',
		displayComponentPath: '/src/widgets/custom/Seo/Display.svelte',
		validationSchema: Xa,
		defaults: { features: ['social', 'schema', 'advanced', 'ai'], translated: !0 },
		getTranslatablePaths: (e) => [
			`${e}.title`,
			`${e}.description`,
			`${e}.focusKeyword`,
			`${e}.ogTitle`,
			`${e}.ogDescription`,
			`${e}.twitterTitle`,
			`${e}.twitterDescription`,
			`${e}.schemaMarkup`
		],
		GuiSchema: {
			label: { widget: r, required: !0 },
			db_fieldName: { widget: r, required: !1 },
			required: { widget: k, required: !1 },
			translated: { widget: k, required: !1 },
			features: { widget: r, required: !1, helper: 'Comma-separated features (social, schema, advanced, ai).' }
		},
		GraphqlSchema: () => ({ typeID: 'String', graphql: '' })
	}),
	Qa = Object.freeze(Object.defineProperty({ __proto__: null, default: Ka }, Symbol.toStringTag, { value: 'Module' })),
	Dt = Object.assign({
		'./core/Checkbox/index.ts': Fi,
		'./core/Date/index.ts': zi,
		'./core/DateRange/index.ts': Hi,
		'./core/Group/index.ts': Xi,
		'./core/Input/index.ts': Ki,
		'./core/MediaUpload/index.ts': Yi,
		'./core/MegaMenu/index.ts': ra,
		'./core/Radio/index.ts': na,
		'./core/Relation/index.ts': ha,
		'./core/RichText/index.ts': ya
	}),
	Ct = Object.assign({
		'./custom/Address/index.ts': xa,
		'./custom/ColorPicker/index.ts': Na,
		'./custom/Currency/index.ts': Ia,
		'./custom/Email/index.ts': ja,
		'./custom/Number/index.ts': Ra,
		'./custom/PhoneNumber/index.ts': Fa,
		'./custom/Rating/index.ts': za,
		'./custom/RemoteVideo/index.ts': Ba,
		'./custom/Seo/index.ts': Qa
	});
({ ...Dt, ...Ct });
class Ya {
	#e = W(ie({}));
	get widgets() {
		return a(this.#e);
	}
	set widgets(t) {
		D(this.#e, t, !0);
	}
	#t = W(ie({}));
	get widgetFunctions() {
		return a(this.#t);
	}
	set widgetFunctions(t) {
		D(this.#t, t, !0);
	}
	#i = W(ie([]));
	get coreWidgets() {
		return a(this.#i);
	}
	set coreWidgets(t) {
		D(this.#i, t, !0);
	}
	#a = W(ie([]));
	get customWidgets() {
		return a(this.#a);
	}
	set customWidgets(t) {
		D(this.#a, t, !0);
	}
	#r = W(ie([]));
	get marketplaceWidgets() {
		return a(this.#r);
	}
	set marketplaceWidgets(t) {
		D(this.#r, t, !0);
	}
	#s = W(ie([]));
	get activeWidgets() {
		return a(this.#s);
	}
	set activeWidgets(t) {
		D(this.#s, t, !0);
	}
	#o = W(ie({}));
	get dependencyMap() {
		return a(this.#o);
	}
	set dependencyMap(t) {
		D(this.#o, t, !0);
	}
	#n = W('default');
	get tenantId() {
		return a(this.#n);
	}
	set tenantId(t) {
		D(this.#n, t, !0);
	}
	#l = W(!1);
	get isLoaded() {
		return a(this.#l);
	}
	set isLoaded(t) {
		D(this.#l, t, !0);
	}
	#d = W(!1);
	get loading() {
		return a(this.#d);
	}
	set loading(t) {
		D(this.#d, t, !0);
	}
	#c = W('initializing');
	get healthStatus() {
		return a(this.#c);
	}
	set healthStatus(t) {
		D(this.#c, t, !0);
	}
	#u = W(void 0);
	get lastHealthCheck() {
		return a(this.#u);
	}
	set lastHealthCheck(t) {
		D(this.#u, t, !0);
	}
	constructor() {}
	async initialize(t = 'default', i) {
		if (this.loading) {
			le.debug('[WidgetStore] Initialization already in progress, skipping.');
			return;
		}
		if (this.isLoaded && this.tenantId === t && !i) {
			le.debug('[WidgetStore] Widgets already loaded, skipping initialization.');
			return;
		}
		((this.loading = !0), (this.tenantId = t), le.info(`[WidgetStore] Initializing for tenant: ${t}`));
		try {
			const s = {},
				n = [],
				p = [],
				c = {};
			for (const [_, q] of Object.entries(Dt)) {
				const P = _.split('/').at(-2);
				if (!P || typeof q.default != 'function') continue;
				const m = q.default,
					M = m.Name || P;
				((m.Name = M),
					(m.__widgetType = 'core'),
					(s[M] = m),
					n.push(M),
					m.__dependencies && m.__dependencies.length > 0 && (c[M] = m.__dependencies),
					P && P !== M && (s[P] = m));
			}
			for (const [_, q] of Object.entries(Ct)) {
				const P = _.split('/').at(-2);
				if (!P || typeof q.default != 'function') continue;
				const m = q.default,
					M = m.Name || P;
				((m.Name = M),
					(m.__widgetType = 'custom'),
					(s[M] = m),
					p.push(M),
					m.__dependencies && m.__dependencies.length > 0 && (c[M] = m.__dependencies),
					P && P !== M && (s[P] = m));
			}
			((this.widgetFunctions = s), (this.coreWidgets = n), (this.customWidgets = p), (this.dependencyMap = c));
			let y = [];
			if (i) {
				const _ = await i.widgets.getActiveWidgets();
				_.success && (y = (_.data ?? []).map((q) => q.name));
			} else if (typeof window < 'u') {
				const _ = await fetch(`/api/widgets/active${this.isLoaded ? '' : '?refresh=true'}`, { headers: { 'X-Tenant-ID': t } });
				_.ok && (y = ((await _.json()).widgets || []).map((P) => P.name));
			}
			const x = y
					.map((_) => {
						if (this.widgetFunctions[_]) return _;
						const q = _.charAt(0).toLowerCase() + _.slice(1);
						if (this.widgetFunctions[q]) return q;
						const P = _.toLowerCase();
						return this.widgetFunctions[P] ? P : _;
					})
					.filter((_) => this.widgetFunctions[_]),
				j = [...new Set([...x, ...n])];
			this.activeWidgets = j;
			const C = {};
			for (const [_, q] of Object.entries(this.widgetFunctions)) C[_] = q({});
			((this.widgets = C),
				(this.isLoaded = !0),
				(this.loading = !1),
				(this.healthStatus = 'healthy'),
				(this.lastHealthCheck = Date.now()),
				le.info(`[WidgetStore] Initialized: ${this.coreWidgets.length} core, ${this.customWidgets.length} custom widgets.`));
		} catch (s) {
			((this.loading = !1), (this.healthStatus = 'unhealthy'), le.error('[WidgetStore] Initialization failed:', s));
		}
	}
	async updateStatus(t, i, s) {
		const n = s || this.tenantId,
			p = i === 'active';
		if (!(p && Pt(t))) {
			if (!p && !er(t)) throw new Error(`Cannot disable widget ${t}: other widgets depend on it`);
			if (p) {
				const y = Za(t).filter((x) => !Nt(x));
				if (y.length > 0) throw new Error(`Cannot activate widget ${t}: missing dependencies: ${y.join(', ')}`);
			}
			try {
				(await this.updateInDatabase(t, p, n),
					p ? this.activeWidgets.includes(t) || this.activeWidgets.push(t) : (this.activeWidgets = this.activeWidgets.filter((c) => c !== t)),
					le.info(`[WidgetStore] Widget '${t}' status changed to '${i}'`));
			} catch (c) {
				throw (le.error(`[WidgetStore] Failed to update status for ${t}:`, c), c);
			}
		}
	}
	async updateConfig(t, i) {
		const s = this.widgetFunctions[t];
		if (!s || typeof s != 'function') return;
		const n = Object.assign((p) => s({ ...i, ...p }), s);
		((this.widgetFunctions[t] = n), (this.widgets[t] = n({})));
	}
	async reload(t) {
		((this.isLoaded = !1), await this.initialize(t || this.tenantId));
	}
	async updateInDatabase(t, i, s) {
		if (
			typeof window < 'u' &&
			!(
				await fetch('/api/widgets/status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': s },
					body: JSON.stringify({ widgetName: t, isActive: i })
				})
			).ok
		)
			throw new Error('Database sync failed');
	}
}
const U = new Ya();
function Nt(e) {
	return U.activeWidgets.includes(e);
}
function Pt(e) {
	return U.coreWidgets.includes(e);
}
function Za(e) {
	return U.dependencyMap[e] || [];
}
function er(e) {
	return Pt(e)
		? !1
		: !Object.entries(U.dependencyMap)
				.filter(([, i]) => i.includes(e))
				.map(([i]) => i)
				.some(Nt);
}
const br = {
		updateStatus: U.updateStatus.bind(U),
		updateConfig: U.updateConfig.bind(U),
		reload: U.reload.bind(U),
		initializeWidgets: U.initialize.bind(U)
	},
	vr = {
		subscribe(e) {
			return (e(U.widgetFunctions), () => {});
		}
	};
export { me as P, U as a, vr as b, St as c, br as w };
//# sourceMappingURL=vkx2g0aB.js.map
