import { p as s } from './C9E6SjbS.js';
import { a as u } from './C-hhfhAN.js';
import './BvngfGKt.js';
const d = { archive: 'archive', draft: 'draft', publish: 'publish', unpublish: 'unpublish', schedule: 'schedule', clone: 'clone', delete: 'delete' },
	g = (t, r) => {
		const n = {};
		for (const e in r)
			Object.prototype.hasOwnProperty.call(t, e) && Array.isArray(t[e])
				? (n[e] = i(t[e]))
				: Object.prototype.hasOwnProperty.call(t, e) && (n[e] = t[e]);
		return n;
	},
	y = (t) => {
		const r = new FormData(),
			n = (e) =>
				e instanceof Blob
					? e
					: typeof e == 'object' && e !== null
						? JSON.stringify(e)
						: typeof e == 'boolean' || typeof e == 'number'
							? e.toString()
							: e == null
								? ''
								: String(e);
		for (const e in t) {
			const a = t[e];
			a !== void 0 && r.append(e, n(a));
		}
		return r;
	},
	c = s.IMAGE_SIZES || {};
({ ...c });
function h(t, r = !1) {
	if (!t) return '';
	if (t.db_fieldName) return t.db_fieldName;
	const n = { 'First Name': 'first_name', 'Last Name': 'last_name' };
	let e = t.label;
	return (
		!e && 'widget' in t && t.widget?.Name && (e = t.widget.Name),
		!e && 'type' in t && (e = t.type),
		e || (e = 'unknown_field'),
		r
			? e
			: n[e]
				? n[e]
				: e
						.toLowerCase()
						.replace(/\s+/g, '_')
						.replace(/[^a-z0-9_]/g, '')
	);
}
function i(t) {
	if (t === null || typeof t != 'object') return t;
	if (Array.isArray(t)) return t.map((n) => i(n));
	const r = {};
	for (const n in t) Object.prototype.hasOwnProperty.call(t, n) && (r[n] = i(t[n]));
	return r;
}
function _(t) {
	if (t === 0 || isNaN(t)) return '0 bytes';
	if (t < 0) throw Error('Input size cannot be negative');
	const r = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
	let n = 0;
	for (; t >= 1024 && n < r.length - 1; ) ((t /= 1024), n++);
	return `${t.toFixed(2)} ${r[n]}`;
}
function w(t) {
	if (t == null) return '-';
	const r = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: !1 },
		n = u.contentLanguage;
	return new Date(t * 1e3).toLocaleDateString(n, r);
}
const b = {
	meta_data: {},
	add(t, r) {
		this.meta_data[t] = r;
	},
	get() {
		return this.meta_data;
	},
	clear() {
		this.meta_data = {};
	},
	is_empty() {
		return Object.keys(this.meta_data).length === 0;
	}
};
function l(t = 300, r = !1) {
	let n,
		e = !1;
	return (a) => {
		if (r && !e) {
			(a(), (e = !0));
			return;
		}
		(clearTimeout(n),
			(n = setTimeout(() => {
				a();
			}, t)));
	};
}
l.create = function (t, r = 300) {
	let n;
	return function (...a) {
		const o = () => {
			(clearTimeout(n), t(...a));
		};
		(clearTimeout(n), (n = setTimeout(o, r)));
	};
};
function N(t) {
	return ['ar', 'he', 'fa', 'ur', 'dv', 'ha', 'khw', 'ks', 'ku', 'ps', 'syr', 'ug', 'yi'].includes(t) ? 'rtl' : 'ltr';
}
function T(t) {
	return t;
}
export { d as S, T as a, g as b, N as c, l as d, w as e, _ as f, h as g, b as m, y as o };
//# sourceMappingURL=D3eWcrZU.js.map
