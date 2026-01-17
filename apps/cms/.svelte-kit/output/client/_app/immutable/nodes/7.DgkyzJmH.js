import { i as W } from '../chunks/zi73tRJP.js';
import {
	p as Ne,
	z as Ge,
	b as s,
	d as w,
	c as a,
	r as t,
	s as l,
	ag as st,
	t as C,
	g as e,
	a as je,
	x as me,
	f as ie,
	n as tt,
	u as Te,
	a9 as nt
} from '../chunks/DrlZFkx8.js';
import { d as Ee, f as g, s as U, e as Ze, a as f, c as Pe, t as Ie } from '../chunks/CTjXDULS.js';
import { c as Se } from '../chunks/7bh91wXp.js';
import { r as ze, b as z, c as ne, g as rt, a as lt, e as dt, d as We } from '../chunks/MEFvoR_D.js';
import { p as $e } from '../chunks/CxX94NXM.js';
import { t as J } from '../chunks/C-hhfhAN.js';
import { l as ct } from '../chunks/BvngfGKt.js';
import { g as Fe, l as et } from '../chunks/7IKENDK9.js';
import { P as vt } from '../chunks/C6jjkVLf.js';
import { e as Ce, i as De } from '../chunks/BXe5mj2j.js';
import { a as ft } from '../chunks/BEiD40NV.js';
import { b as Ye } from '../chunks/D4QnGYgQ.js';
import { p as ut } from '../chunks/DePHBZW_.js';
import { modalState as it } from '../chunks/GeUt2_20.js';
import { o as mt, aU as pt, b1 as _t } from '../chunks/N8Jg0v49.js';
import { d as yt } from '../chunks/BH6PMYIi.js';
import { P as _e } from '../chunks/PsFRGuNZ.js';
import { s as bt } from '../chunks/BSPmpUse.js';
import { o as gt } from '../chunks/CMZtchEj.js';
import { T as xt } from '../chunks/_e9Aq20d.js';
import { T as ht } from '../chunks/B0T_vZHe.js';
import { b as wt } from '../chunks/Cl42wY7v.js';
import { T as he } from '../chunks/BpC4PXBd.js';
var kt = g(
	'<div class="card w-modal space-y-4 p-4 shadow-xl"><header class="text-center text-2xl font-bold"> </header> <form class="modal-form space-y-4 border border-surface-500 p-4 rounded-container-token" id="roleForm"><label class="label"><span>Role Name:</span> <input type="text" placeholder="Role Name" class="input" required/></label> <label class="label"><span>Role Description:</span> <textarea placeholder="Role Description" class="input" rows="3"></textarea></label></form> <footer class="modal-footer flex justify-end gap-4"><button class="preset-outlined-surface-500btn"> </button> <button type="submit" form="roleForm" class="preset-filled-primary-500 btn"> </button></footer></div>'
);
function St(p, d) {
	Ne(d, !0);
	const R = ut(d, 'selectedPermissions', 19, () => []);
	let m = w(''),
		E = w('');
	Ge(() => {
		(s(m, d.roleName, !0), s(E, d.roleDescription, !0));
	});
	function k(Y) {
		(Y.preventDefault(),
			it.close({
				roleName: e(m),
				roleDescription: e(E),
				currentGroupName: d.currentGroupName,
				selectedPermissions: R(),
				currentRoleId: d.currentRoleId
			}));
	}
	var _ = kt(),
		u = a(_),
		ce = a(u, !0);
	t(u);
	var oe = l(u, 2),
		le = a(oe),
		Z = l(a(le), 2);
	(ze(Z), t(le));
	var O = l(le, 2),
		K = l(a(O), 2);
	(st(K), t(O), t(oe));
	var $ = l(oe, 2),
		y = a($);
	y.__click = function (...Y) {
		d.parent.onClose?.apply(this, Y);
	};
	var B = a(y, !0);
	t(y);
	var ve = l(y, 2),
		de = a(ve, !0);
	(t(ve),
		t($),
		t(_),
		C(
			(Y) => {
				(U(ce, d.isEditMode ? 'Edit Role' : 'Create New Role'), U(B, Y), U(de, d.isEditMode ? 'Update' : 'Create'));
			},
			[() => mt()]
		),
		Ze('submit', oe, k),
		Ye(
			Z,
			() => e(m),
			(Y) => s(m, Y)
		),
		Ye(
			K,
			() => e(E),
			(Y) => s(E, Y)
		),
		f(p, _),
		je());
}
Ee(['click']);
const re = [];
for (let p = 0; p < 256; ++p) re.push((p + 256).toString(16).slice(1));
function Ct(p, d = 0) {
	return (
		re[p[d + 0]] +
		re[p[d + 1]] +
		re[p[d + 2]] +
		re[p[d + 3]] +
		'-' +
		re[p[d + 4]] +
		re[p[d + 5]] +
		'-' +
		re[p[d + 6]] +
		re[p[d + 7]] +
		'-' +
		re[p[d + 8]] +
		re[p[d + 9]] +
		'-' +
		re[p[d + 10]] +
		re[p[d + 11]] +
		re[p[d + 12]] +
		re[p[d + 13]] +
		re[p[d + 14]] +
		re[p[d + 15]]
	).toLowerCase();
}
let Xe;
const Rt = new Uint8Array(16);
function Tt() {
	if (!Xe) {
		if (typeof crypto > 'u' || !crypto.getRandomValues)
			throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
		Xe = crypto.getRandomValues.bind(crypto);
	}
	return Xe(Rt);
}
const Pt = typeof crypto < 'u' && crypto.randomUUID && crypto.randomUUID.bind(crypto),
	at = { randomUUID: Pt };
function At(p, d, R) {
	p = p || {};
	const m = p.random ?? p.rng?.() ?? Tt();
	if (m.length < 16) throw new Error('Random bytes length must be >= 16');
	return ((m[6] = (m[6] & 15) | 64), (m[8] = (m[8] & 63) | 128), Ct(m));
}
function Mt(p, d, R) {
	return at.randomUUID && !p ? at.randomUUID() : At(p);
}
var Dt = g('<p>No roles defined yet.</p>'),
	It = g('<input type="checkbox" class="mr-2"/>'),
	Nt = g('<iconify-icon></iconify-icon>', 2),
	jt = g(
		'<div class="animate-flip flex items-center justify-between rounded border p-2 hover:bg-surface-500 md:flex-row"><div class="flex items-center gap-2"><iconify-icon></iconify-icon> <!> <span class="flex items-center text-xl font-semibold text-tertiary-500 dark:text-primary-500"> <!></span></div> <p class="mt-2 hidden text-sm text-gray-600 dark:text-gray-400 md:ml-4 md:mt-0 md:block"> </p> <button aria-label="Edit role" class="preset-filled-secondary-500 btn"><iconify-icon></iconify-icon> <span class="hidden md:block">Edit</span></button></div>',
		2
	),
	Et = g('<div class="rounded-8"><section class="list-none space-y-2"></section></div>'),
	Lt = g(
		'<h3 class="mb-2 text-center text-xl font-bold">Roles Management:</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Manage user roles and their access permissions. You can create, edit, or delete roles and assign specific permissions to them.</p> <div class="wrapper my-4"><div class="mb-4 flex items-center justify-between"><button class="preset-filled-primary-500 btn">Create Role</button> <button class="preset-filled-error-500 btn"> </button></div> <div class="role mt-4 flex-1 overflow-auto svelte-xnjn9r"><!></div></div>',
		1
	);
function Ut(p, d) {
	Ne(d, !0);
	const R = 100;
	let m = w(me([])),
		E = w(me([])),
		k = w(me(new Set()));
	const _ = me(new Set());
	let u = w(me([])),
		ce = w(!1),
		oe = w(null),
		le = w('');
	Ge(() => {
		if (e(m).length === 0 && d.roleData.length > 0) {
			const o = d.roleData.map((r) => ({ ...r, id: r._id }));
			(s(m, o, !0), s(u, o, !0));
		}
	});
	const Z = (o = null, r = '') => {
			(s(ce, !!o),
				s(oe, o ? o._id : null, !0),
				s(le, r || '', !0),
				s(E, o?.permissions || [], !0),
				it.trigger(St, {
					isEditMode: e(ce),
					currentRoleId: e(oe),
					roleName: o?.name || '',
					roleDescription: o?.description || '',
					currentGroupName: e(le),
					selectedPermissions: e(E),
					response: (c) => {
						c && O(c);
					},
					title: e(ce) ? 'Edit Role' : 'Create Role'
				}));
		},
		O = async (o) => {
			const { roleName: r, roleDescription: c, currentGroupName: i, selectedPermissions: b, currentRoleId: G } = o;
			if (!r) return;
			const T = G ?? Mt().replace(/-/g, ''),
				h = { _id: T, id: T, name: r, description: c, groupName: i, permissions: b };
			if (!e(ce)) (s(u, [...e(u), h], !0), _.add(T), J.info({ description: 'Role added. Click "Save" at the top to apply changes.' }));
			else if (G) {
				const P = e(u).findIndex((N) => N._id === G);
				((e(u)[P] = h), s(u, [...e(u)], !0), _.add(G), J.info({ description: 'Role updated. Click "Save" at the top to apply changes.' }));
			}
			s(m, e(u), !0);
			const M = e(u).map(({ id: P, ...N }) => N);
			(d.setRoleData(M), d.updateModifiedCount && d.updateModifiedCount(_.size));
		},
		K = async () => {
			for (const r of e(k)) {
				const c = e(u).findIndex((i) => i._id === r);
				(e(u).splice(c, 1), _.add(r));
			}
			(s(u, [...e(u)], !0), s(m, e(u), !0), s(k, new Set(), !0), J.info({ description: 'Roles deleted. Click "Save" at the top to apply changes.' }));
			const o = e(u).map(({ id: r, ...c }) => c);
			(d.setRoleData(o), d.updateModifiedCount && d.updateModifiedCount(_.size));
		},
		$ = (o) => {
			const r = new Set(e(k));
			(r.has(o) ? r.delete(o) : r.add(o), s(k, r, !0));
		};
	function y(o) {
		(s(u, [...o.detail.items], !0), s(m, e(u), !0));
		const r = o.detail.items.find((i) => i.id === o.detail.info.id);
		r && _.add(r._id);
		const c = e(u).map(({ id: i, ...b }) => b);
		(d.setRoleData(c), d.updateModifiedCount && d.updateModifiedCount(_.size));
	}
	function B(o) {
		(s(u, [...o.detail.items], !0), s(m, e(u), !0));
		const r = o.detail.items.find((i) => i.id === o.detail.info.id);
		r && _.add(r._id);
		const c = e(u).map(({ id: i, ...b }) => b);
		(d.setRoleData(c), d.updateModifiedCount && d.updateModifiedCount(_.size));
	}
	var ve = Pe(),
		de = ie(ve);
	{
		var Y = (o) => {
			var r = Lt(),
				c = l(ie(r), 4),
				i = a(c),
				b = a(i);
			b.__click = () => Z(null, '');
			var G = l(b, 2);
			G.__click = K;
			var T = a(G);
			(t(G), t(i));
			var h = l(i, 2),
				M = a(h);
			{
				var P = (D) => {
						var Q = Dt();
						f(D, Q);
					},
					N = (D) => {
						var Q = Et(),
							x = a(Q);
						(Ce(
							x,
							21,
							() => e(u),
							(L) => L.id,
							(L, j) => {
								var fe = jt(),
									ee = a(fe),
									H = a(ee);
								(z(H, 'icon', 'mdi:drag'), z(H, 'width', '18'), ne(H, 1, 'cursor-move text-gray-500 dark:text-gray-300'));
								var X = l(H, 2);
								{
									var ue = (q) => {
										var A = It();
										(ze(A), (A.__change = () => $(e(j)._id)), C((V) => rt(A, V), [() => e(k).has(e(j)._id)]), f(q, A));
									};
									W(X, (q) => {
										e(j).isAdmin || q(ue);
									});
								}
								var ye = l(X, 2),
									F = a(ye),
									I = l(F);
								{
									var te = (q) => {
										var A = Nt();
										(z(A, 'icon', 'material-symbols:info'),
											z(A, 'width', '18'),
											ne(A, 1, 'ml-1 text-tertiary-500 dark:text-primary-500'),
											C(() => z(A, 'title', e(j).description)),
											f(q, A));
									};
									W(I, (q) => {
										e(j).description && q(te);
									});
								}
								(t(ye), t(ee));
								var n = l(ee, 2),
									v = a(n, !0);
								t(n);
								var S = l(n, 2);
								S.__click = () => Z(e(j));
								var ae = a(S);
								(z(ae, 'icon', 'mdi:pencil'),
									ne(ae, 1, 'text-white'),
									z(ae, 'width', '18'),
									tt(2),
									t(S),
									t(fe),
									C(() => {
										(U(F, `${e(j).name ?? ''} `), U(v, e(j).description));
									}),
									f(L, fe));
							}
						),
							t(x),
							ft(
								x,
								(L, j) => yt?.(L, j),
								() => ({ items: e(u), flipDurationMs: R, type: 'column' })
							),
							t(Q),
							Ze('consider', x, y),
							Ze('finalize', x, B),
							f(D, Q));
					};
				W(M, (D) => {
					e(m).length === 0 ? D(P) : D(N, !1);
				});
			}
			(t(h),
				t(c),
				C(() => {
					((G.disabled = e(k).size === 0), U(T, `Delete Roles (${e(k).size ?? ''})`));
				}),
				f(o, r));
		};
		W(de, (o) => {
			o(Y, !1);
		});
	}
	(f(p, ve), je());
}
Ee(['click', 'change']);
var Ot = g('<p class="text-tertiary-500 dark:text-primary-500"> </p>'),
	Bt = g(
		'<p class="mb-2 w-full overflow-auto text-nowrap text-center">* <span class="text-tertiary-500 dark:text-primary-500"> </span> Role has all permissions</p>'
	),
	Ft = g('<iconify-icon></iconify-icon>', 2),
	zt = g('<iconify-icon></iconify-icon>', 2),
	Gt = g('<th class="py-2"> </th>'),
	Vt = g('<td class="px-1 py-1"><input type="checkbox" class="form-checkbox"/></td>'),
	Wt = g(
		'<tr class="divide-x border-b text-center hover:bg-surface-50 dark:hover:bg-surface-600"><td class="px-1 py-1 md:text-left"> </td><td class="px-1 py-1"> </td><!></tr>'
	),
	$t = g('<tr><td class="border-b bg-surface-500 px-1 py-2 font-semibold text-tertiary-500 dark:text-primary-500 lg:text-left"> </td></tr> <!>', 1),
	Yt = g(
		'<!> <div class="permission overflow-auto svelte-v46j2e"><table class="compact w-full table-auto border"><thead class="sticky top-0 border bg-surface-800"><tr class="divide-x text-tertiary-500 dark:text-primary-500"><th title="Click to sort by permission name"><div class="flex items-center justify-center">Type <!></div></th><th title="Click to sort by action"><div class="flex items-center justify-center">Action <!></div></th><!></tr></thead><tbody></tbody></table></div>',
		1
	),
	Ht = g(
		`<h3 class="mb-2 text-center text-xl font-bold">Permission Management:</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Select the roles for each permission and click 'Save' to apply your changes.</p> <div class="sticky top-0 z-10 mb-4 flex items-center justify-between"><input type="text" placeholder="Search Permissions..." class="input mr-4 grow" aria-label="Search permissions"/></div> <!>`,
		1
	);
function Jt(p, d) {
	Ne(d, !0);
	let R = w(me([])),
		m = w(me([])),
		E = w('');
	const k = me(new Set());
	let _ = w('name'),
		u = w(0);
	const ce = (o) => {
			const r = [];
			return (
				o.forEach((c) => {
					let i = '';
					if (c.type === _e.COLLECTION) i = 'Collection Entries';
					else if (c.type === _e.USER) i = 'User Management';
					else if (c.type === _e.CONFIGURATION) i = 'Configuration';
					else if (c.type === _e.SYSTEM) {
						const b = c._id.split(':')[0];
						b === 'system'
							? (i = 'System')
							: b === 'api'
								? (i = 'API Access')
								: b === 'content'
									? (i = 'Content Management')
									: b === 'media'
										? (i = 'Media Management')
										: b === 'config'
											? (i = 'Configuration')
											: b === 'admin'
												? (i = 'Admin')
												: (i = 'System');
					}
					i && !r.includes(i) && r.push(i);
				}),
				r
			);
		},
		oe = (o) => {
			e(_) === o ? (s(u, e(u) === 1 ? -1 : e(u) === -1 ? 0 : 1, !0), e(u) === 0 && s(_, 'name')) : (s(_, o, !0), s(u, 1));
		},
		le = (o) =>
			e(u) === 0
				? o
				: [...o].sort((r, c) => {
						let i = '',
							b = '';
						return (
							e(_) === 'name'
								? ((i = r.name.toLowerCase()), (b = c.name.toLowerCase()))
								: e(_) === 'action'
									? ((i = r.action.toLowerCase()), (b = c.action.toLowerCase()))
									: e(_) === 'type' && ((i = r.type.toLowerCase()), (b = c.type.toLowerCase())),
							i < b ? (e(u) === 1 ? -1 : 1) : i > b ? (e(u) === 1 ? 1 : -1) : 0
						);
					}),
		Z = Te(() => e(R).filter((o) => o._id?.toLowerCase().includes(e(E).toLowerCase()) ?? !1)),
		O = Te(() => ce(e(Z))),
		K = Te(() => e(m).find((o) => o.isAdmin)),
		$ = Te(() => e(m).filter((o) => !o.isAdmin).length);
	Ge(() => {
		e(R).length === 0 && $e.data.permissions.length > 0 && (s(m, d.roleData, !0), s(R, $e.data.permissions, !0));
	});
	const y = (o, r) => {
			let c = [];
			return (
				r === 'Collection Entries'
					? (c = o.filter((i) => i.type === _e.COLLECTION))
					: r === 'User Management'
						? (c = o.filter((i) => i.type === _e.USER))
						: r === 'Configuration'
							? (c = o.filter((i) => i.type === _e.CONFIGURATION || (i.type === _e.SYSTEM && i._id.startsWith('config:'))))
							: r === 'System'
								? (c = o.filter((i) => i.type === _e.SYSTEM && i._id.startsWith('system:')))
								: r === 'API Access'
									? (c = o.filter((i) => i.type === _e.SYSTEM && i._id.startsWith('api:')))
									: r === 'Content Management'
										? (c = o.filter((i) => i.type === _e.SYSTEM && i._id.startsWith('content:')))
										: r === 'Media Management'
											? (c = o.filter((i) => i.type === _e.SYSTEM && i._id.startsWith('media:')))
											: r === 'Admin'
												? (c = o.filter((i) => i.type === _e.SYSTEM && i._id.startsWith('admin:')))
												: (c = o.filter((i) => i._id.split(':')[0] === r.toLowerCase())),
				le(c)
			);
		},
		B = (o, r) => {
			const c = e(m).map((i) => {
				if (i._id === r) {
					const b = [...i.permissions],
						G = b.findIndex((T) => T === o);
					return (G === -1 ? b.push(o) : b.splice(G, 1), { ...i, permissions: b });
				}
				return i;
			});
			(k.add(o), s(m, c, !0), d.setRoleData(c), d.updateModifiedCount(k.size));
		};
	var ve = Pe(),
		de = ie(ve);
	{
		var Y = (o) => {
			var r = Ht(),
				c = l(ie(r), 4),
				i = a(c);
			(ze(i), t(c));
			var b = l(c, 2);
			{
				var G = (h) => {
						var M = Ot(),
							P = a(M, !0);
						(t(M), C(() => U(P, e(E) ? 'No permissions match your search.' : 'No permissions defined yet.')), f(h, M));
					},
					T = (h) => {
						var M = Yt(),
							P = ie(M);
						{
							var N = (n) => {
								var v = Bt(),
									S = l(a(v)),
									ae = a(S, !0);
								(t(S), tt(), t(v), C(() => U(ae, e(K).name)), f(n, v));
							};
							W(P, (n) => {
								e(K) && n(N);
							});
						}
						var D = l(P, 2),
							Q = a(D),
							x = a(Q),
							L = a(x),
							j = a(L);
						j.__click = () => oe('name');
						var fe = a(j),
							ee = l(a(fe));
						{
							var H = (n) => {
								var v = Ft();
								(C(() => z(v, 'icon', e(u) === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded')),
									z(v, 'width', '16'),
									ne(v, 1, 'ml-1'),
									f(n, v));
							};
							W(ee, (n) => {
								e(_) === 'name' && e(u) !== 0 && n(H);
							});
						}
						(t(fe), t(j));
						var X = l(j);
						X.__click = () => oe('action');
						var ue = a(X),
							ye = l(a(ue));
						{
							var F = (n) => {
								var v = zt();
								(C(() => z(v, 'icon', e(u) === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded')),
									z(v, 'width', '16'),
									ne(v, 1, 'ml-1'),
									f(n, v));
							};
							W(ye, (n) => {
								e(_) === 'action' && e(u) !== 0 && n(F);
							});
						}
						(t(ue), t(X));
						var I = l(X);
						(Ce(
							I,
							17,
							() => e(m),
							De,
							(n, v) => {
								var S = Pe(),
									ae = ie(S);
								{
									var q = (A) => {
										var V = Gt(),
											se = a(V, !0);
										(t(V), C(() => U(se, e(v).name)), f(A, V));
									};
									W(ae, (A) => {
										e(v).isAdmin || A(q);
									});
								}
								f(n, S);
							}
						),
							t(L),
							t(x));
						var te = l(x);
						(Ce(
							te,
							21,
							() => e(O),
							De,
							(n, v) => {
								var S = Pe(),
									ae = ie(S);
								{
									var q = (A) => {
										var V = $t(),
											se = ie(V),
											pe = a(se),
											He = a(pe);
										(t(pe), t(se));
										var Je = l(se, 2);
										(Ce(
											Je,
											17,
											() => y(e(Z), e(v)),
											De,
											(qe, be) => {
												var xe = Wt(),
													we = a(xe),
													Le = a(we, !0);
												t(we);
												var ke = l(we),
													ge = a(ke, !0);
												t(ke);
												var Ae = l(ke);
												(Ce(
													Ae,
													17,
													() => e(m),
													De,
													(Ue, Oe) => {
														var Ve = Pe(),
															Re = ie(Ve);
														{
															var Me = (Be) => {
																var Ke = Vt(),
																	Qe = a(Ke);
																(ze(Qe),
																	(Qe.__change = () => B(e(be)._id, e(Oe)._id)),
																	t(Ke),
																	C((ot) => rt(Qe, ot), [() => e(Oe).permissions.includes(e(be)._id)]),
																	f(Be, Ke));
															};
															W(Re, (Be) => {
																e(Oe).isAdmin || Be(Me);
															});
														}
														f(Ue, Ve);
													}
												),
													t(xe),
													C(() => {
														(U(Le, e(be).name), U(ge, e(be).action));
													}),
													f(qe, xe));
											}
										),
											C(() => {
												(lt(pe, 'colspan', e($) + 2), U(He, `${e(v) ?? ''}:`));
											}),
											f(A, V));
									};
									W(ae, (A) => {
										y(e(Z), e(v)).length > 0 && A(q);
									});
								}
								f(n, S);
							}
						),
							t(te),
							t(Q),
							t(D),
							C(() => {
								(ne(j, 1, `cursor-pointer select-none py-2 ${e(_) === 'name' ? 'font-semibold text-primary-500 dark:text-secondary-400' : ''}`),
									ne(X, 1, `cursor-pointer select-none py-2 ${e(_) === 'action' ? 'font-semibold text-primary-500 dark:text-secondary-400' : ''}`));
							}),
							f(h, M));
					};
				W(b, (h) => {
					e(Z).length === 0 ? h(G) : h(T, !1);
				});
			}
			(Ye(
				i,
				() => e(E),
				(h) => s(E, h)
			),
				f(o, r));
		};
		W(de, (o) => {
			o(Y, !1);
		});
	}
	(f(p, ve), je());
}
Ee(['click', 'change']);
var qt = g('<option> </option>'),
	Kt = g(
		'<p class="mt-4 text-center lg:text-left">Selected Admin Role ID: <span class="ml-2 text-tertiary-500 dark:text-primary-500"> </span></p> <div class="mt-4 flex justify-between"><button class="variant-filled-secondary btn">Cancel</button> <button class="preset-filled-tertiary-500 btn"><!></button></div>',
		1
	),
	Qt = g('<p class="mt-4 text-green-600"> </p>'),
	Xt = g(
		'<h3 class="mb-2 text-center text-xl font-bold">Admin Role Management:</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Please select a new role for the administrator from the dropdown below. Your changes will take effect after you click "Save Changes".</p> <div class="wrapper my-4"><p class="my-4 text-center lg:text-left">Current Admin Role: <span class="ml-2 text-tertiary-500 dark:text-primary-500"> </span></p> <label for="adminRole" class="block text-sm text-surface-300">Select new Administrator Role:</label> <select id="adminRole" class="input"></select> <!> <!></div>',
		1
	);
function Zt(p, d) {
	Ne(d, !0);
	let R = w(null),
		m = w(null),
		E = w(!1),
		k = w(null),
		_ = w(null);
	const u = Te(() => d.roleData.filter((y) => y._id !== e(R))),
		ce = Te(() => e(_) !== e(R));
	Ge(() => {
		if (!e(R) && d.roleData.length > 0) {
			const y = d.roleData.find((B) => B.isAdmin === !0);
			y && (s(R, y._id, !0), s(m, y.name, !0), s(_, y._id, !0));
		}
	});
	const oe = (y) => {
			const B = y.target.value;
			s(_, B, !0);
		},
		le = async () => {
			try {
				(s(E, !0), s(k, null), await nt(), s(R, e(_), !0));
				try {
					const y = d.roleData.map((B) =>
						B._id === e(_) ? (s(m, B.name, !0), { ...B, isAdmin: !0 }) : B.isAdmin === !0 ? { ...B, isAdmin: !1 } : B
					);
					d.setRoleData(y);
				} catch {
					bt('Network error occurred while updating config file', 'error');
				}
				s(k, 'Admin role changed. Click "Save" at the top to apply changes.');
			} catch (y) {
				s(k, `Failed to save admin role: ${y instanceof Error ? y.message : String(y)}`);
			} finally {
				s(E, !1);
			}
		},
		Z = () => {
			s(_, e(R), !0);
		};
	var O = Pe(),
		K = ie(O);
	{
		var $ = (y) => {
			var B = Xt(),
				ve = l(ie(B), 4),
				de = a(ve),
				Y = l(a(de)),
				o = a(Y, !0);
			(t(Y), t(de));
			var r = l(de, 4);
			((r.__change = oe),
				Ce(
					r,
					21,
					() => e(u),
					De,
					(T, h) => {
						var M = qt(),
							P = a(M, !0);
						t(M);
						var N = {};
						(C(() => {
							(U(P, e(h).name), N !== (N = e(h)._id) && (M.value = (M.__value = e(h)._id) ?? ''));
						}),
							f(T, M));
					}
				),
				t(r));
			var c = l(r, 2);
			{
				var i = (T) => {
					var h = Kt(),
						M = ie(h),
						P = l(a(M)),
						N = a(P, !0);
					(t(P), t(M));
					var D = l(M, 2),
						Q = a(D);
					Q.__click = Z;
					var x = l(Q, 2);
					x.__click = le;
					var L = a(x);
					{
						var j = (ee) => {
								var H = Ie('Saving...');
								f(ee, H);
							},
							fe = (ee) => {
								var H = Ie('Save Changes');
								f(ee, H);
							};
						W(L, (ee) => {
							e(E) ? ee(j) : ee(fe, !1);
						});
					}
					(t(x),
						t(D),
						C(() => {
							(U(N, e(_)), (x.disabled = e(E)));
						}),
						f(T, h));
				};
				W(c, (T) => {
					e(ce) && T(i);
				});
			}
			var b = l(c, 2);
			{
				var G = (T) => {
					var h = Qt(),
						M = a(h, !0);
					(t(h), C(() => U(M, e(k))), f(T, h));
				};
				W(b, (T) => {
					e(k) && T(G);
				});
			}
			(t(ve),
				C(() => U(o, e(m))),
				dt(
					r,
					() => e(_),
					(T) => s(_, T)
				),
				f(y, B));
		};
		W(K, (y) => {
			y($, !1);
		});
	}
	(f(p, O), je());
}
Ee(['change', 'click']);
var ea = g(
		'<th><div class="text-terriary-500 flex items-center justify-center text-center dark:text-primary-500"> <iconify-icon></iconify-icon></div></th>',
		2
	),
	ta = g(
		'<div class="flex items-center gap-2"><code> </code> <button class="preset-outline-surface-500 btn-icon btn-icon-sm" aria-label="Copy token to clipboard"><iconify-icon></iconify-icon></button></div>',
		2
	),
	aa = g('<td><!></td>'),
	ra = g('<tr><!><td><button class="preset-filled-error-500 btn-sm">Delete</button></td></tr>'),
	ia = g(
		'<div class="p-4"><h3 class="mb-2 text-center text-xl font-bold">Website Access Tokens</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Manage API tokens for external websites to access your content.</p> <div class="card mb-4"><div class="p-4"><h4 class="h4 mb-2 font-bold text-tertiary-500 dark:text-primary-500">Generate New Website Token</h4> <div class="flex gap-2"><input type="text" class="input" placeholder="Token Name"/> <button class="preset-filled-primary-500 btn">Generate</button></div></div></div> <div class="card"><div class="p-4"><div class="my-4 flex flex-wrap items-center justify-between gap-1"><h4 class="h4 font-bold text-tertiary-500 dark:text-primary-500">Existing Tokens</h4> <div class="order-3 sm:order-2"><!></div></div> <!> <div class="table-container"><table class="table"><thead><!><tr class="divide-x divide-preset-400 border-b border-black dark:border-white"><!><th class="text-terriary-500 text-center dark:text-primary-500">Action</th></tr></thead><tbody></tbody></table></div> <div class="flex justify-center"><div class="mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4"><!></div></div></div></div></div>'
	);
function oa(p, d) {
	Ne(d, !0);
	let R = w(me([])),
		m = w(me([]));
	const E = Te(() => new Map(e(m).map((n) => [n._id, n.username || n.email])));
	let k = w(''),
		_ = '',
		u = !1,
		ce = !1,
		oe = !1,
		le = 'normal',
		Z = w(me({})),
		O = w(me({ sortedBy: 'createdAt', isSorted: -1 })),
		K = w(1),
		$ = w(10),
		y = w(0);
	const B = Te(() => Math.ceil(e(y) / e($)) || 1);
	let de = w(
		me(
			[
				{ label: 'Name', key: 'name' },
				{ label: 'Token', key: 'token' },
				{ label: 'Created At', key: 'createdAt' },
				{ label: 'Created By', key: 'createdBy' }
			].map((n) => ({ ...n, visible: !0, id: `header-${n.key}` }))
		)
	);
	gt(async () => {
		await Promise.all([o(), Y()]);
	});
	async function Y() {
		const n = { value: e(m) };
		try {
			const v = await fetch('/api/admin/users');
			if (v.ok) {
				const S = await v.json();
				n.value = S.data;
			} else J.error({ description: 'Failed to fetch users' });
		} catch {
			J.error({ description: 'An error occurred while fetching users' });
		}
		s(m, n.value, !0);
	}
	async function o() {
		const n = e(K),
			v = e($),
			S = e(O),
			ae = e(Z),
			q = { value: e(R) },
			A = { value: e(y) };
		(await Fe.withLoading(
			et.tokenGeneration,
			async () => {
				const V = new URLSearchParams();
				(V.set('page', String(n)),
					V.set('limit', String(v)),
					V.set('sort', S.sortedBy),
					S.isSorted !== 0 && V.set('order', S.isSorted === 1 ? 'asc' : 'desc'));
				for (const [se, pe] of Object.entries(ae)) pe && V.set(se, pe);
				try {
					const se = await fetch(`/api/website-tokens?${V.toString()}`);
					if (se.ok) {
						const pe = await se.json();
						((q.value = pe.data), (A.value = pe.pagination.totalItems));
					} else J.error({ description: 'Failed to fetch tokens' });
				} catch {
					J.error({ description: 'An error occurred while fetching tokens' });
				}
			},
			'Fetching website tokens'
		),
			s(R, q.value, !0),
			s(y, A.value, !0));
	}
	async function r() {
		const n = e(k);
		if (!n) {
			J.error({ description: 'Please enter a name for the token.' });
			return;
		}
		try {
			const v = await fetch('/api/website-tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: n })
			});
			v.ok
				? (await o(), J.success({ description: `Token generated for ${n}` }), s(k, ''))
				: v.status === 409
					? J.error({ description: 'A token with this name already exists' })
					: J.error({ description: 'Failed to generate token' });
		} catch {
			J.error({ description: 'An error occurred while generating the token' });
		}
	}
	async function c(n, v) {
		wt({
			title: 'Delete Token',
			body: `Are you sure you want to delete the token "${v}"? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					(await fetch(`/api/website-tokens/${n}`, { method: 'DELETE' })).ok
						? (await o(), J.success({ description: 'Token deleted.' }))
						: J.error({ description: 'Failed to delete token' });
				} catch {
					J.error({ description: 'An error occurred while deleting the token' });
				}
			}
		});
	}
	Ge(() => {
		e(y) <= 1 || (e(K), e($), e(O), o());
	});
	var i = ia(),
		b = l(a(i), 4),
		G = a(b),
		T = l(a(G), 2),
		h = a(T);
	ze(h);
	var M = l(h, 2);
	((M.__click = r), t(T), t(G), t(b));
	var P = l(b, 2),
		N = a(P),
		D = a(N),
		Q = l(a(D), 2),
		x = a(Q);
	(ht(x, { globalSearchValue: _, searchShow: u, filterShow: ce, columnShow: oe, density: le }), t(Q), t(D));
	var L = l(D, 2);
	W(L, (n) => {});
	var j = l(L, 2),
		fe = a(j),
		ee = a(fe),
		H = a(ee);
	W(H, (n) => {});
	var X = l(H),
		ue = a(X);
	(Ce(
		ue,
		17,
		() => e(de).filter((n) => n.visible),
		De,
		(n, v) => {
			var S = ea();
			S.__click = () => {
				s(O, { sortedBy: e(v).key, isSorted: e(O).sortedBy === e(v).key ? (e(O).isSorted === 1 ? -1 : e(O).isSorted === -1 ? 0 : 1) : 1 }, !0);
			};
			var ae = a(S),
				q = a(ae),
				A = l(q);
			(z(A, 'icon', 'material-symbols:arrow-upward-rounded'), z(A, 'width', '22'));
			let V;
			(t(ae),
				t(S),
				C(() => {
					(U(q, `${e(v).label ?? ''} `),
						(V = ne(A, 1, 'origin-center duration-300 ease-in-out', null, V, {
							up: e(O).isSorted === 1 && e(O).sortedBy === e(v).key,
							invisible: e(O).isSorted === 0 || e(O).sortedBy !== e(v).key
						})));
				}),
				f(n, S));
		}
	),
		tt(),
		t(X),
		t(ee));
	var ye = l(ee);
	(Ce(
		ye,
		21,
		() => e(R),
		(n) => n._id,
		(n, v) => {
			var S = ra(),
				ae = a(S);
			Ce(
				ae,
				17,
				() => e(de).filter((V) => V.visible),
				De,
				(V, se) => {
					var pe = aa(),
						He = a(pe);
					{
						var Je = (be) => {
								var xe = ta(),
									we = a(xe),
									Le = a(we, !0);
								t(we);
								var ke = l(we, 2);
								ke.__click = async () => {
									(await navigator.clipboard.writeText(e(v).token), J.success({ description: 'Token copied to clipboard' }));
								};
								var ge = a(ke);
								(z(ge, 'icon', 'mdi:clipboard-outline'), z(ge, 'width', '16'), t(ke), t(xe), C(() => U(Le, e(v).token)), f(be, xe));
							},
							qe = (be) => {
								var xe = Pe(),
									we = ie(xe);
								{
									var Le = (ge) => {
											var Ae = Ie();
											(C((Ue) => U(Ae, Ue), [() => new Date(e(v).createdAt).toLocaleDateString()]), f(ge, Ae));
										},
										ke = (ge) => {
											var Ae = Pe(),
												Ue = ie(Ae);
											{
												var Oe = (Re) => {
														var Me = Ie();
														(C((Be) => U(Me, Be), [() => e(E).get(e(v).createdBy) || e(v).createdBy]), f(Re, Me));
													},
													Ve = (Re) => {
														var Me = Ie();
														(C(() => U(Me, e(v)[e(se).key])), f(Re, Me));
													};
												W(
													Ue,
													(Re) => {
														e(se).key === 'createdBy' ? Re(Oe) : Re(Ve, !1);
													},
													!0
												);
											}
											f(ge, Ae);
										};
									W(
										we,
										(ge) => {
											e(se).key === 'createdAt' ? ge(Le) : ge(ke, !1);
										},
										!0
									);
								}
								f(be, xe);
							};
						W(He, (be) => {
							e(se).key === 'token' ? be(Je) : be(qe, !1);
						});
					}
					(t(pe), f(V, pe));
				}
			);
			var q = l(ae),
				A = a(q);
			((A.__click = () => c(e(v)._id, e(v).name)), t(q), t(S), f(n, S));
		}
	),
		t(ye),
		t(fe),
		t(j));
	var F = l(j, 2),
		I = a(F),
		te = a(I);
	(xt(te, {
		get pagesCount() {
			return e(B);
		},
		get totalItems() {
			return e(y);
		},
		onUpdatePage: (n) => s(K, n, !0),
		onUpdateRowsPerPage: (n) => {
			(s($, n, !0), s(K, 1));
		},
		get currentPage() {
			return e(K);
		},
		set currentPage(n) {
			s(K, n, !0);
		},
		get rowsPerPage() {
			return e($);
		},
		set rowsPerPage(n) {
			s($, n, !0);
		}
	}),
		t(I),
		t(F),
		t(N),
		t(P),
		t(i),
		Ye(
			h,
			() => e(k),
			(n) => s(k, n)
		),
		f(p, i),
		je());
}
Ee(['click', 'change', 'input']);
var sa = g('<div class="flex items-center justify-center gap-1 py-4"><iconify-icon></iconify-icon> <span> </span></div>', 2),
	na = g('<div class="flex items-center justify-center gap-1 py-4"><iconify-icon></iconify-icon> <span> </span></div>', 2),
	la = g('<div class="flex items-center justify-center gap-1 py-4"><iconify-icon></iconify-icon> <span>Admin</span></div>', 2),
	da = g('<div class="flex items-center justify-center gap-1 py-4"><iconify-icon></iconify-icon> <span>Website Tokens</span></div>', 2),
	ca = g('<!> <!> <!> <!>', 1),
	va = g('<div class="p-4"><!></div>'),
	fa = g('<div class="p-4"><!></div>'),
	ua = g('<div class="p-4"><!></div>'),
	ma = g('<div class="p-4"><!></div>'),
	pa = g('<!> <!> <!> <!> <!>', 1),
	_a = g(
		`<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><!> <div class="mt-2 flex items-center justify-center gap-4 lg:mt-0 lg:justify-end"><button aria-label="Save all changes" class="preset-filled-tertiary-500 btn"><!></button> <button aria-label="Reset changes" class="preset-filled-secondary-500 btn">Reset</button></div></div> <div class="mb-6 text-center sm:text-left"><p class="text-center text-tertiary-500 dark:text-primary-500">Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.</p></div> <div class="flex flex-col"><!></div>`,
		1
	);
function za(p, d) {
	Ne(d, !0);
	let R = w('0'),
		m = w(me($e.data.roles)),
		E = w(0),
		k = w(!1);
	const _ = (r) => {
			(s(m, r, !0), s(k, !0));
		},
		u = (r) => {
			(s(E, r, !0), s(k, r > 0));
		},
		ce = async () => {
			await Fe.withLoading(
				et.configSave,
				async () => {
					try {
						const r = await fetch('/api/permission/update', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ roles: e(m) })
						});
						if (r.status === 200) (J.success({ description: 'Configuration updated successfully!' }), s(k, !1), s(E, 0));
						else if (r.status === 304) J.info({ description: 'No changes detected, configuration not updated.' });
						else {
							const c = await r.text();
							J.error({ description: `Error updating configuration: ${c}` });
						}
					} catch (r) {
						(ct.error('Network error during save:', r), J.error({ description: 'Network error occurred while updating configuration.' }));
					}
				},
				'Saving access control configuration'
			);
		},
		oe = async () => {
			(s(m, $e.data.roles, !0), s(k, !1), s(E, 0), J.info({ description: 'Changes have been reset.' }));
		};
	var le = _a(),
		Z = ie(le),
		O = a(Z);
	vt(O, { name: 'Access Management', icon: 'mdi:account-key', showBackButton: !0, backUrl: '/config' });
	var K = l(O, 2),
		$ = a(K);
	$.__click = ce;
	var y = a($);
	{
		var B = (r) => {
				var c = Ie('Saving...');
				f(r, c);
			},
			ve = (r) => {
				var c = Ie();
				(C(() => U(c, `Save (${e(E) ?? ''})`)), f(r, c));
			};
		W(y, (r) => {
			Fe.isLoadingReason(et.configSave) ? r(B) : r(ve, !1);
		});
	}
	t($);
	var de = l($, 2);
	((de.__click = oe), t(K), t(Z));
	var Y = l(Z, 4),
		o = a(Y);
	(he(o, {
		get value() {
			return e(R);
		},
		onValueChange: (r) => s(R, r.value, !0),
		class: 'grow',
		children: (r, c) => {
			var i = pa(),
				b = ie(i);
			Se(
				b,
				() => he.List,
				(P, N) => {
					N(P, {
						class: 'flex justify-around text-tertiary-500 dark:text-primary-500 border-b border-surface-200-800',
						children: (D, Q) => {
							var x = ca(),
								L = ie(x);
							Se(
								L,
								() => he.Trigger,
								(H, X) => {
									X(H, {
										value: '0',
										class: 'flex-1',
										children: (ue, ye) => {
											var F = sa(),
												I = a(F);
											(z(I, 'icon', 'mdi:shield-lock-outline'), z(I, 'width', '28'), ne(I, 1, 'text-black dark:text-white'));
											var te = l(I, 2),
												n = a(te, !0);
											(t(te),
												t(F),
												C(
													(v) => {
														(ne(te, 1, We(e(R) === '0' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : '')), U(n, v));
													},
													[() => pt()]
												),
												f(ue, F));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var j = l(L, 2);
							Se(
								j,
								() => he.Trigger,
								(H, X) => {
									X(H, {
										value: '1',
										class: 'flex-1',
										children: (ue, ye) => {
											var F = na(),
												I = a(F);
											(z(I, 'icon', 'mdi:account-group'), z(I, 'width', '28'), ne(I, 1, 'text-black dark:text-white'));
											var te = l(I, 2),
												n = a(te, !0);
											(t(te),
												t(F),
												C(
													(v) => {
														(ne(te, 1, We(e(R) === '1' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : '')), U(n, v));
													},
													[() => _t()]
												),
												f(ue, F));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var fe = l(j, 2);
							Se(
								fe,
								() => he.Trigger,
								(H, X) => {
									X(H, {
										value: '2',
										class: 'flex-1',
										children: (ue, ye) => {
											var F = la(),
												I = a(F);
											(z(I, 'icon', 'mdi:account-cog'), z(I, 'width', '28'), ne(I, 1, 'text-black dark:text-white'));
											var te = l(I, 2);
											(t(F), C(() => ne(te, 1, We(e(R) === '2' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''))), f(ue, F));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var ee = l(fe, 2);
							(Se(
								ee,
								() => he.Trigger,
								(H, X) => {
									X(H, {
										value: '3',
										class: 'flex-1',
										children: (ue, ye) => {
											var F = da(),
												I = a(F);
											(z(I, 'icon', 'mdi:web'), z(I, 'width', '28'), ne(I, 1, 'text-black dark:text-white'));
											var te = l(I, 2);
											(t(F), C(() => ne(te, 1, We(e(R) === '3' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''))), f(ue, F));
										},
										$$slots: { default: !0 }
									});
								}
							),
								f(D, x));
						},
						$$slots: { default: !0 }
					});
				}
			);
			var G = l(b, 2);
			Se(
				G,
				() => he.Content,
				(P, N) => {
					N(P, {
						value: '0',
						children: (D, Q) => {
							var x = va(),
								L = a(x);
							(Jt(L, {
								get roleData() {
									return e(m);
								},
								setRoleData: _,
								updateModifiedCount: u
							}),
								t(x),
								f(D, x));
						},
						$$slots: { default: !0 }
					});
				}
			);
			var T = l(G, 2);
			Se(
				T,
				() => he.Content,
				(P, N) => {
					N(P, {
						value: '1',
						children: (D, Q) => {
							var x = fa(),
								L = a(x);
							(Ut(L, {
								get roleData() {
									return e(m);
								},
								setRoleData: _,
								updateModifiedCount: u
							}),
								t(x),
								f(D, x));
						},
						$$slots: { default: !0 }
					});
				}
			);
			var h = l(T, 2);
			Se(
				h,
				() => he.Content,
				(P, N) => {
					N(P, {
						value: '2',
						children: (D, Q) => {
							var x = ua(),
								L = a(x);
							(Zt(L, {
								get roleData() {
									return e(m);
								},
								setRoleData: _
							}),
								t(x),
								f(D, x));
						},
						$$slots: { default: !0 }
					});
				}
			);
			var M = l(h, 2);
			(Se(
				M,
				() => he.Content,
				(P, N) => {
					N(P, {
						value: '3',
						children: (D, Q) => {
							var x = ma(),
								L = a(x);
							(oa(L, {}), t(x), f(D, x));
						},
						$$slots: { default: !0 }
					});
				}
			),
				f(r, i));
		},
		$$slots: { default: !0 }
	}),
		t(Y),
		C(() => {
			(($.disabled = !e(k) || Fe.isLoading), (de.disabled = !e(k) || Fe.isLoading));
		}),
		f(p, le),
		je());
}
Ee(['click']);
export { za as component };
//# sourceMappingURL=7.DgkyzJmH.js.map
