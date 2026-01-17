import { modalState as p } from './GeUt2_20.js';
import { P as ie, O as se, R as ce, o as Z, N as ue, S as de } from './N8Jg0v49.js';
import { i as D } from './zi73tRJP.js';
import { p as $, c as n, s as u, r, t as k, a as ee, d as F, x as fe, f as me, g as o, u as U, b as g } from './DrlZFkx8.js';
import { d as te, f as x, a as v, s as T, c as be, e as ve } from './CTjXDULS.js';
import { h as W } from './IGLJqrie.js';
import { p as R } from './DePHBZW_.js';
import { e as _e, i as he } from './BXe5mj2j.js';
import { c as V, r as X, e as pe } from './MEFvoR_D.js';
import { b as Y } from './D4QnGYgQ.js';
var xe = x('<h3 class="h3 font-bold text-center"><!></h3>'),
	ye = x('<p class="text-surface-600 dark:text-surface-300 text-center"><!></p>'),
	Ce = x('<button class="btn hover:bg-surface-500/10 border border-surface-200 dark:text-surface-50"> </button>'),
	ge = x(
		'<div class="space-y-4"><!> <!> <div class="flex justify-between gap-4 pt-4"><!> <button class="btn preset-filled-primary-500"> </button></div></div>'
	);
function Te(e, t) {
	$(t, !0);
	const s = R(t, 'body', 3, 'Are you sure?'),
		c = R(t, 'buttonTextConfirm', 3, 'Confirm'),
		f = R(t, 'buttonTextCancel', 3, 'Cancel');
	function d() {
		t.close?.(!0);
	}
	function S() {
		t.close?.(!1);
	}
	var y = ge(),
		M = n(y);
	{
		var P = (i) => {
			var a = xe(),
				m = n(a);
			(W(m, () => t.htmlTitle), r(a), v(i, a));
		};
		D(M, (i) => {
			t.htmlTitle && i(P);
		});
	}
	var w = u(M, 2);
	{
		var E = (i) => {
			var a = ye(),
				m = n(a);
			(W(m, s), r(a), v(i, a));
		};
		D(w, (i) => {
			s() && i(E);
		});
	}
	var A = u(w, 2),
		O = n(A);
	{
		var H = (i) => {
			var a = Ce();
			a.__click = S;
			var m = n(a, !0);
			(r(a), k(() => T(m, f())), v(i, a));
		};
		D(O, (i) => {
			f() && i(H);
		});
	}
	var _ = u(O, 2);
	_.__click = d;
	var C = n(_, !0);
	(r(_), r(A), r(y), k(() => T(C, c())), v(e, y), ee());
}
te(['click']);
var we = x('<option> </option>'),
	Ae = x('<div class="text-sm text-error-500" role="alert"> </div>'),
	De = x(
		'<div role="dialog" aria-labelledby="schedule-modal-title"><header id="schedule-modal-title">Schedule Entry</header> <article class="text-center text-sm">Set a date and time to publish this entry.</article> <form><div class="grid grid-cols-1 gap-4 md:grid-cols-2"><label class="label"><span>Date</span> <input class="input" type="date" required aria-label="Date"/></label> <label class="label"><span>Time</span> <input class="input" type="time" required aria-label="Time"/></label></div> <label class="label"><span>Action</span> <select class="select" aria-label="Action"></select></label> <!></form> <footer class="modal-footer flex items-center justify-end space-x-4"><button class="btn preset-outlined-secondary-500"> </button> <button class="btn preset-filled-primary-500"> </button></footer></div>'
	);
function ke(e, t) {
	$(t, !0);
	let s = F(''),
		c = F(''),
		f = F(fe(p.active?.props?.meta?.initialAction || 'publish')),
		d = F('');
	const S = U(() => `${o(s)}T${o(c)}`),
		y = U(() => o(s) !== '' && o(c) !== ''),
		M = [
			{ value: 'publish', label: ie() },
			{ value: 'unpublish', label: se() },
			{ value: 'delete', label: ce() }
		];
	function P() {
		return o(y)
			? new Date(o(S)) < new Date()
				? (g(d, 'Please select a future date and time'), !1)
				: (g(d, ''), !0)
			: (g(d, 'Date and time are required'), !1);
	}
	function w() {
		P() && p.close({ confirmed: !0, date: new Date(o(S)), action: o(f) });
	}
	const E = 'text-2xl font-bold';
	var A = be(),
		O = me(A);
	{
		var H = (_) => {
			var C = De();
			V(C, 1, 'modal-schedule card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800');
			var i = n(C);
			V(i, 1, `text-center text-primary-500 ${E}`);
			var a = u(i, 4);
			V(a, 1, 'modal-form border border-surface-500 p-4 space-y-4 rounded-container-token');
			var m = n(a),
				I = n(m),
				B = u(n(I), 2);
			(X(B), r(I));
			var G = u(I, 2),
				J = u(n(G), 2);
			(X(J), r(G), r(m));
			var L = u(m, 2),
				N = u(n(L), 2);
			(_e(
				N,
				21,
				() => M,
				he,
				(l, b) => {
					var h = we(),
						le = n(h, !0);
					r(h);
					var Q = {};
					(k(() => {
						(T(le, o(b).label), Q !== (Q = o(b).value) && (h.value = (h.__value = o(b).value) ?? ''));
					}),
						v(l, h));
				}
			),
				r(N),
				r(L));
			var ae = u(L, 2);
			{
				var re = (l) => {
					var b = Ae(),
						h = n(b, !0);
					(r(b), k(() => T(h, o(d))), v(l, b));
				};
				D(ae, (l) => {
					o(d) && l(re);
				});
			}
			r(a);
			var K = u(a, 2),
				q = n(K);
			q.__click = () => p.close();
			var oe = n(q, !0);
			r(q);
			var j = u(q, 2);
			j.__click = () => w();
			var ne = n(j, !0);
			(r(j),
				r(K),
				r(C),
				k(
					(l, b) => {
						(T(oe, l), (j.disabled = !o(y)), T(ne, b));
					},
					[() => Z(), () => ue()]
				),
				ve('submit', a, (l) => {
					(l.preventDefault(), w());
				}),
				Y(
					B,
					() => o(s),
					(l) => g(s, l)
				),
				Y(
					J,
					() => o(c),
					(l) => g(c, l)
				),
				pe(
					N,
					() => o(f),
					(l) => g(f, l)
				),
				v(_, C));
		};
		D(O, (_) => {
			p.active && _(H);
		});
	}
	(v(e, A), ee());
}
te(['click']);
function Le(e) {
	const t = e.component?.ref || e.component;
	p.trigger(t, e.props || e.meta || {}, e.response);
}
function z(e) {
	p.trigger(
		Te,
		{
			htmlTitle: e.title,
			body: e.body,
			buttonTextConfirm: e.buttonTextConfirm || e.confirmText || de?.() || 'Confirm',
			buttonTextCancel: e.cancelText || Z?.() || 'Cancel'
		},
		(t) => {
			t ? e.onConfirm?.() : e.onCancel?.();
		}
	);
}
function Ne(e) {
	const { isArchive: t = !1, count: s = 1, onConfirm: c, onCancel: f } = e,
		d = t ? 'Archive' : 'Delete';
	z({ title: `Confirm ${d}`, body: `Are you sure you want to ${d.toLowerCase()} ${s} item(s)?`, confirmText: d, onConfirm: c, onCancel: f });
}
function Re(e) {
	const { status: t, count: s = 1, onConfirm: c, onCancel: f } = e;
	z({
		title: 'Confirm Status Change',
		body: `Are you sure you want to change ${s} item(s) to ${t}?`,
		confirmText: 'Change Status',
		onConfirm: c,
		onCancel: f
	});
}
function Ve(e) {
	p.trigger(ke, { initialAction: e.initialAction }, (t) => {
		t?.confirmed && t.date && e.onSchedule(t.date, t.action || e.initialAction || 'publish');
	});
}
function ze(e) {
	const { count: t = 1, onConfirm: s, onCancel: c } = e;
	z({ title: 'Clone Items', body: `Are you sure you want to clone ${t} item(s)?`, confirmText: 'Clone', onConfirm: s, onCancel: c });
}
export { ze as a, z as b, Ne as c, Re as d, Ve as e, Le as s };
//# sourceMappingURL=Cl42wY7v.js.map
