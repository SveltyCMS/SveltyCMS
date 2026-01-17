import { a8 as _, M as o, a9 as E, B as S, D as n, k as i, aa as C, ab as g, J as w, I as m } from './DrlZFkx8.js';
function B(e, c, a = c) {
	var d = new WeakSet();
	(_(e, 'input', async (r) => {
		var v = r ? e.defaultValue : e.value;
		if (((v = b(e) ? t(v) : v), a(v), o !== null && d.add(o), await E(), v !== (v = c()))) {
			var f = e.selectionStart,
				s = e.selectionEnd,
				h = e.value.length;
			if (((e.value = v ?? ''), s !== null)) {
				var l = e.value.length;
				f === s && s === h && l > h ? ((e.selectionStart = l), (e.selectionEnd = l)) : ((e.selectionStart = f), (e.selectionEnd = Math.min(s, l)));
			}
		}
	}),
		((i && e.defaultValue !== e.value) || (S(c) == null && e.value)) && (a(b(e) ? t(e.value) : e.value), o !== null && d.add(o)),
		n(() => {
			var r = c();
			if (e === document.activeElement) {
				var v = C ?? o;
				if (d.has(v)) return;
			}
			(b(e) && r === t(e.value)) || (e.type === 'date' && !r && !e.value) || (r !== e.value && (e.value = r ?? ''));
		}));
}
const u = new Set();
function D(e, c, a, d, r = d) {
	var v = a.getAttribute('type') === 'checkbox',
		f = e;
	let s = !1;
	if (c !== null) for (var h of c) f = f[h] ??= [];
	(f.push(a),
		_(
			a,
			'change',
			() => {
				var l = a.__value;
				(v && (l = y(f, l, a.checked)), r(l));
			},
			() => r(v ? [] : null)
		),
		n(() => {
			var l = d();
			if (i && a.defaultChecked !== a.checked) {
				s = !0;
				return;
			}
			v ? ((l = l || []), (a.checked = l.includes(a.__value))) : (a.checked = g(a.__value, l));
		}),
		w(() => {
			var l = f.indexOf(a);
			l !== -1 && f.splice(l, 1);
		}),
		u.has(f) ||
			(u.add(f),
			m(() => {
				(f.sort((l, k) => (l.compareDocumentPosition(k) === 4 ? -1 : 1)), u.delete(f));
			})),
		m(() => {
			if (s) {
				var l;
				if (v) l = y(f, l, a.checked);
				else {
					var k = f.find((x) => x.checked);
					l = k?.__value;
				}
				r(l);
			}
		}));
}
function M(e, c, a = c) {
	(_(e, 'change', (d) => {
		var r = d ? e.defaultChecked : e.checked;
		a(r);
	}),
		((i && e.defaultChecked !== e.checked) || S(c) == null) && a(e.checked),
		n(() => {
			var d = c();
			e.checked = !!d;
		}));
}
function y(e, c, a) {
	for (var d = new Set(), r = 0; r < e.length; r += 1) e[r].checked && d.add(e[r].__value);
	return (a || d.delete(c), Array.from(d));
}
function b(e) {
	var c = e.type;
	return c === 'number' || c === 'range';
}
function t(e) {
	return e === '' ? null : +e;
}
function V(e, c, a = c) {
	(_(e, 'change', () => {
		a(e.files);
	}),
		i && e.files && a(e.files),
		n(() => {
			e.files = c();
		}));
}
export { D as a, B as b, M as c, V as d };
//# sourceMappingURL=D4QnGYgQ.js.map
