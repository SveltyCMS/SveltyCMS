import { d as m, x as S, g as h, b as d } from './DrlZFkx8.js';
import {
	d as f,
	f as g,
	g as k,
	h as l,
	a as o,
	i as P,
	j as y,
	o as u,
	k as T,
	e as U,
	t as $,
	l as n,
	s as r,
	m as p,
	r as _,
	q as j,
	u as E,
	v as A,
	w as L
} from './Bg__saH3.js';
class R {
	constructor(s, i) {
		((this.schema = i), (this.data = { ...s }));
	}
	#s = m(S({}));
	get data() {
		return h(this.#s);
	}
	set data(s) {
		d(this.#s, s, !0);
	}
	#e = m(S({}));
	get errors() {
		return h(this.#e);
	}
	set errors(s) {
		d(this.#e, s, !0);
	}
	#a = m(!1);
	get submitting() {
		return h(this.#a);
	}
	set submitting(s) {
		d(this.#a, s, !0);
	}
	#t = m(void 0);
	get message() {
		return h(this.#t);
	}
	set message(s) {
		d(this.#t, s, !0);
	}
	reset(s) {
		(s && (this.data = { ...s }), (this.errors = {}), (this.message = void 0), (this.submitting = !1));
	}
	validate() {
		if (((this.errors = {}), (this.message = void 0), this.schema)) {
			const s = f(this.schema, this.data);
			if (!s.success) {
				const i = g(s.issues).nested;
				return ((this.errors = i), !1);
			}
		}
		return !0;
	}
	enhance(s) {
		return (i) => {
			if (((this.submitting = !0), (this.message = void 0), (this.errors = {}), s?.onSubmit && s.onSubmit(i), this.schema)) {
				const a = f(this.schema, this.data);
				if (!a.success) {
					const e = g(a.issues).nested;
					((this.errors = e), (this.submitting = !1), i.cancel());
					return;
				}
			}
			return async (a) => {
				const { result: e, update: F } = a;
				((this.submitting = !1),
					e.type === 'failure'
						? (e.data?.errors && (this.errors = e.data.errors), e.data?.message && (this.message = e.data.message))
						: e.type === 'success' && e.data?.message && (this.message = e.data.message),
					s?.onResult ? await s.onResult(a) : await F());
			};
		};
	}
	async submit(s, i = {}) {
		if (((this.submitting = !0), (this.message = void 0), (this.errors = {}), this.schema)) {
			const a = f(this.schema, this.data);
			if (!a.success) {
				const e = g(a.issues).nested;
				return ((this.errors = e), (this.submitting = !1), { success: !1, errors: this.errors });
			}
		}
		try {
			const a = await fetch(s, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...i, body: JSON.stringify(this.data) }),
				e = await a.json();
			return a.ok
				? ((this.message = e.message), { success: !0, data: e })
				: ((this.errors = e.errors || {}), (this.message = e.message || 'An error occurred'), { success: !1, data: e });
		} catch (a) {
			return ((this.message = a instanceof Error ? a.message : 'Network error'), { success: !1, error: a });
		} finally {
			this.submitting = !1;
		}
	}
}
const w = 8,
	v = o(
		r(),
		n(),
		p(2, 'Username must be at least 2 characters'),
		j(50, 'Username must be at most 50 characters'),
		_(/^[a-zA-Z0-9@$!%*#._-]+$/, 'Username contains invalid characters')
	),
	c = o(
		r(),
		n(),
		$((t) => t.toLowerCase()),
		U('Invalid email address')
	),
	b = o(
		r(),
		n(),
		p(w, `Password must be at least ${w} characters and include a letter, number, and special character`),
		_(
			/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]).{8,}$/,
			`Password must be at least ${w} characters and include a letter, number, and special character`
		)
	),
	x = o(r(), n()),
	N = o(r(), n(), p(16, 'Token must be at least 16 characters')),
	z = k({ email: c, password: b, isToken: A() }),
	I = l({ email: c }),
	Z = o(
		l({ password: b, confirm_password: x, token: N, email: c }),
		P(
			L([['password'], ['confirm_password']], (t) => t.password === t.confirm_password, 'Passwords do not match'),
			['confirm_password']
		)
	),
	q = o(
		k({ username: v, email: c, password: b, confirm_password: x, token: u(T(r())) }),
		y((t) => t.password === t.confirm_password, 'Passwords do not match')
	),
	G = l({ email: c, role: r(), expiresIn: E(['2 hrs', '12 hrs', '2 days', '1 week', '2 weeks', '1 month']) }),
	H = o(
		l({ user_id: r(), username: v, email: c, role: u(r()), password: u(r()), confirmPassword: u(r()) }),
		P(
			y((t) => (t.password && t.password.length > 0 ? t.password === t.confirmPassword : !0), 'Passwords do not match'),
			['confirmPassword']
		)
	);
export { R as F, G as a, H as e, I as f, z as l, Z as r, q as s };
//# sourceMappingURL=n4ph2YWf.js.map
