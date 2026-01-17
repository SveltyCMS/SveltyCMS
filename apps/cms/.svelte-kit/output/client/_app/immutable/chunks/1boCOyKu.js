import { i as k } from './zi73tRJP.js';
import { p as ie, a as ne, f as S, c as r, r as s, n as oe, s as y, g as e, u as le, t as j, d as ce, b as de } from './DrlZFkx8.js';
import { c as I, a as c, f as p, s as U } from './CTjXDULS.js';
import { e as fe } from './BXe5mj2j.js';
import { r as ue, b as T, c as ve, a as W } from './MEFvoR_D.js';
import { b as me } from './D4QnGYgQ.js';
import { p as u } from './DePHBZW_.js';
import { B as ge } from './KG4G7ZS9.js';
const Le = { name: 'Online Users', icon: 'mdi:account-multiple-outline', defaultSize: { w: 1, h: 2 } };
var pe = p(
		'<div class="relative"><input type="text" placeholder="Search users..." class="w-full rounded-md border border-surface-300 bg-surface-50 px-3 py-1.5 text-xs placeholder-surface-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-500"/> <iconify-icon></iconify-icon></div>',
		2
	),
	he = p(
		'<div class="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-surface-50 dark:hover:bg-surface-700"><div class="flex min-w-0 flex-1 items-center gap-2"><img class="h-7 w-7 shrink-0 rounded-full bg-surface-200 dark:bg-surface-700"/> <span class="truncate text-sm font-medium text-surface-800 dark:text-surface-200"> </span></div> <span class="shrink-0 text-xs text-surface-500 dark:text-surface-50"> </span></div>'
	),
	_e = p('<div class="flex h-full items-center justify-center text-sm text-surface-500"> </div>'),
	xe = p('<div class="flex h-full items-center justify-center text-sm text-surface-500">No users are currently active.</div>'),
	be = p(
		'<div class="flex h-full flex-col space-y-2"><div class="text-center text-sm"><span class="font-bold text-primary-500"> </span> User(s) currently online.</div> <!> <div class="grow space-y-1 overflow-y-auto" style="max-height: 180px;"><!></div></div>'
	),
	ye = p('<div class="flex h-full items-center justify-center text-sm text-surface-500">Loading online users...</div>');
function Ne(q, d) {
	ie(d, !0);
	let h = ce('');
	const D = u(d, 'label', 3, 'Online Users'),
		M = u(d, 'theme', 3, 'light'),
		P = u(d, 'icon', 3, 'mdi:account-multiple-outline'),
		E = u(d, 'widgetId', 3, void 0),
		F = u(d, 'size', 19, () => ({ w: 1, h: 1 })),
		G = u(d, 'onSizeChange', 3, (v) => {}),
		H = u(d, 'onRemove', 3, () => {});
	function J(v) {
		return `https://placehold.co/40x40/6366f1/e0e7ff?text=${v
			.split(' ')
			.map((x) => x[0])
			.join('')
			.substring(0, 2)
			.toUpperCase()}`;
	}
	function K(v, _) {
		if (!_.trim()) return v;
		const x = _.toLowerCase();
		return v.filter((m) => m.name.toLowerCase().includes(x));
	}
	(ge(q, {
		get label() {
			return D();
		},
		get theme() {
			return M();
		},
		endpoint: '/api/dashboard/online_user',
		pollInterval: 6e4,
		get icon() {
			return P();
		},
		get widgetId() {
			return E();
		},
		get size() {
			return F();
		},
		get onSizeChange() {
			return G();
		},
		get onCloseRequest() {
			return H();
		},
		children: (_, x) => {
			let m = () => x?.().data;
			var L = I(),
				Q = S(L);
			{
				var V = (g) => {
						const w = le(() => K(m().onlineUsers, e(h)));
						var z = be(),
							C = r(z),
							N = r(C),
							Y = r(N, !0);
						(s(N), oe(), s(C));
						var O = y(C, 2);
						{
							var Z = (t) => {
								var i = pe(),
									f = r(i);
								ue(f);
								var n = y(f, 2);
								(T(n, 'icon', 'mdi:magnify'),
									ve(n, 1, 'absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500'),
									T(n, 'width', '14'),
									s(i),
									me(
										f,
										() => e(h),
										(o) => de(h, o)
									),
									c(t, i));
							};
							k(O, (t) => {
								m().onlineUsers.length > 0 && t(Z);
							});
						}
						var R = y(O, 2),
							$ = r(R);
						{
							var ee = (t) => {
									var i = I(),
										f = S(i);
									(fe(
										f,
										17,
										() => e(w),
										(n) => n.id,
										(n, o) => {
											var a = he(),
												l = r(a),
												b = r(l),
												A = y(b, 2),
												ae = r(A, !0);
											(s(A), s(l));
											var B = y(l, 2),
												re = r(B, !0);
											(s(B),
												s(a),
												j(
													(se) => {
														(W(b, 'src', se), W(b, 'alt', `${e(o).name ?? ''}'s avatar`), U(ae, e(o).name), U(re, e(o).onlineTime || 'N/A'));
													},
													[() => e(o).avatarUrl || J(e(o).name)]
												),
												c(n, a));
										}
									),
										c(t, i));
								},
								te = (t) => {
									var i = I(),
										f = S(i);
									{
										var n = (a) => {
												var l = _e(),
													b = r(l);
												(s(l), j(() => U(b, `No users found matching "${e(h) ?? ''}".`)), c(a, l));
											},
											o = (a) => {
												var l = xe();
												c(a, l);
											};
										k(
											f,
											(a) => {
												e(h) ? a(n) : a(o, !1);
											},
											!0
										);
									}
									c(t, i);
								};
							k($, (t) => {
								e(w).length > 0 ? t(ee) : t(te, !1);
							});
						}
						(s(R), s(z), j(() => U(Y, m().onlineUsers.length)), c(g, z));
					},
					X = (g) => {
						var w = ye();
						c(g, w);
					};
				k(Q, (g) => {
					m()?.onlineUsers ? g(V) : g(X, !1);
				});
			}
			c(_, L);
		},
		$$slots: { default: !0 }
	}),
		ne());
}
export { Ne as default, Le as widgetMeta };
//# sourceMappingURL=1boCOyKu.js.map
