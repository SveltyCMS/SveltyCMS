import { i as n } from './zi73tRJP.js';
import { p as Re, z as Z, g as a, u as _, d as p, b as H, B as Ye, c as h, s as I, r as x, t as d, a as Ze, f as k } from './DrlZFkx8.js';
import { f as b, e as ue, a as r, s as o, d as pe, t as E, c as A } from './CTjXDULS.js';
import { r as $e, h as ea, a as u, c as se } from './MEFvoR_D.js';
import { p as K } from './DePHBZW_.js';
import { l as aa } from './BvngfGKt.js';
import { c as ta } from './vkx2g0aB.js';
import { g as ia } from './D3eWcrZU.js';
import { p as ra } from './Bg__saH3.js';
import { v as X, a as la } from './C-hhfhAN.js';
import { p as na } from './C9E6SjbS.js';
var da = b('<button class="px-2!" type="button"> </button>'),
	fa = b('<span aria-label="Character count"><!></span>'),
	ua = b('<span class="px-1!"> </span>'),
	sa = b('<div class="flex items-center" role="status" aria-live="polite"><!> <!></div>'),
	oa = b(
		'<div class="flex items-center px-2" aria-label="Validating"><div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div></div>'
	),
	va = b('<p class="absolute bottom-0 left-0 w-full text-center text-xs text-surface-500 dark:text-surface-50"> </p>'),
	ca = b('<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite"> </p>'),
	ma = b(
		'<div class="relative mb-4 min-h-10 w-full pb-6"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group"><!> <input type="text" data-testid="text-input"/> <!> <!></div> <!> <!></div>'
	);
function Oa(oe, e) {
	Re(e, !0);
	let f = K(e, 'value', 15),
		$ = K(e, 'validateOnChange', 3, !0),
		ve = K(e, 'validateOnBlur', 3, !0),
		ce = K(e, 'debounceMs', 3, 300);
	const me = _(() => !1),
		ee = 1e5;
	f() && typeof f() == 'string' && f().length > ee && f(f().substring(0, ee));
	const ae = _(() => (e.field.translated ? la.contentLanguage : (na.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase()));
	let j = _(() => f()?.[a(ae)] ?? ''),
		L = _(() => a(j)?.length ?? 0),
		N,
		te = p(!1),
		g = _(() => ia(e.field)),
		v = _(() => X.getError(a(g))),
		T = p(!1),
		ie = p(!1);
	function ge(t) {
		return t.replace(/[\u200B-\u200D\uFEFF]/g, '').normalize('NFKC');
	}
	let _e = _(() => () => {
			const t = a(L);
			return (e.field?.minLength && t < e.field?.minLength) || (e.field?.maxLength && t > e.field?.maxLength)
				? 'bg-error-500'
				: e.field?.count && t === e.field?.count
					? 'bg-success-500'
					: e.field?.count && t > e.field?.count
						? 'bg-warning-500'
						: e.field?.minLength
							? '!preset-filled-surface-500'
							: '!preset-outlined-surface-500';
		}),
		he = _(() => ta(e.field));
	async function P(t = !1) {
		const i = a(j);
		N && (clearTimeout(N), (N = void 0));
		const s = async () => {
			H(T, !0);
			try {
				try {
					return (ra(a(he), e.field.translated ? (f() ?? void 0) : i), X.clearError(a(g)), null);
				} catch (c) {
					if (c.issues) {
						const W = c.issues[0]?.message || 'Invalid input';
						return (X.setError(a(g), W), W);
					}
					throw c;
				}
			} catch (c) {
				aa.error('Validation error:', c);
				const y = 'An unexpected error occurred during validation';
				return (X.setError(a(g), y), y);
			} finally {
				H(T, !1);
			}
		};
		return t
			? await s()
			: new Promise((c) => {
					N = window.setTimeout(async () => {
						const y = await s();
						c(y);
					}, ce());
				});
	}
	function xe() {
		$() && P(!1);
	}
	async function be() {
		(H(ie, !0), ve() && (await P(!0)));
	}
	function Le() {}
	function ye(t) {
		f() || f({});
		const i = ge(t);
		f({ ...(f() || {}), [a(ae)]: i });
	}
	(Z(() => () => {
		N && clearTimeout(N);
	}),
		Z(() => {
			a(me) &&
				!a(te) &&
				(H(te, !0),
				Ye(() => {
					P(!0);
				}));
		}),
		Z(() => {
			a(ie) && $() && P(!1);
		}));
	var we = { WidgetData: async () => f() },
		J = ma(),
		Q = h(J),
		re = h(Q);
	{
		var Ee = (t) => {
			var i = da(),
				s = h(i, !0);
			(x(i),
				d(() => {
					(u(i, 'aria-label', `${e.field.prefix} prefix`), o(s, e.field?.prefix));
				}),
				r(t, i));
		};
		n(re, (t) => {
			e.field?.prefix && t(Ee);
		});
	}
	var l = I(re, 2);
	($e(l),
		(l.__input = (t) => {
			(ye(t.currentTarget.value), xe());
		}));
	let le;
	var ne = I(l, 2);
	{
		var Ne = (t) => {
			var i = sa(),
				s = h(i);
			{
				var c = (w) => {
					var m = fa(),
						R = h(m);
					{
						var Me = (V) => {
								var B = E();
								(d(() => o(B, `${a(L) ?? ''}/${e.field?.maxLength ?? ''}`)), r(V, B));
							},
							ze = (V) => {
								var B = A(),
									Ie = k(B);
								{
									var ke = (O) => {
											var q = E();
											(d(() => o(q, `${a(L) ?? ''}/${e.field?.maxLength ?? ''}`)), r(O, q));
										},
										Ae = (O) => {
											var q = A(),
												Be = k(q);
											{
												var qe = (C) => {
														var D = E();
														(d(() => o(D, `${a(L) ?? ''} => ${e.field?.minLength ?? ''}`)), r(C, D));
													},
													De = (C) => {
														var D = A(),
															Ge = k(D);
														{
															var Se = (F) => {
																	var G = E();
																	(d(() => o(G, `${a(L) ?? ''} => ${e.field?.minLength ?? ''}/${e.field?.maxLength ?? ''}`)), r(F, G));
																},
																Ue = (F) => {
																	var G = A(),
																		Pe = k(G);
																	{
																		var We = (M) => {
																				var S = E();
																				(d(() => o(S, `${a(L) ?? ''}/${e.field?.count ?? ''}`)), r(M, S));
																			},
																			He = (M) => {
																				var S = A(),
																					Ke = k(S);
																				{
																					var Xe = (z) => {
																							var U = E();
																							(d(() => o(U, `${a(L) ?? ''}/${e.field?.maxLength ?? ''}`)), r(z, U));
																						},
																						je = (z) => {
																							var U = A(),
																								Je = k(U);
																							{
																								var Qe = (Y) => {
																									var fe = E();
																									(d(() => o(fe, `min ${e.field?.minLength ?? ''}`)), r(Y, fe));
																								};
																								n(
																									Je,
																									(Y) => {
																										e.field?.minLength && Y(Qe);
																									},
																									!0
																								);
																							}
																							r(z, U);
																						};
																					n(
																						Ke,
																						(z) => {
																							e.field?.maxLength ? z(Xe) : z(je, !1);
																						},
																						!0
																					);
																				}
																				r(M, S);
																			};
																		n(
																			Pe,
																			(M) => {
																				e.field?.count ? M(We) : M(He, !1);
																			},
																			!0
																		);
																	}
																	r(F, G);
																};
															n(
																Ge,
																(F) => {
																	e.field?.minLength && e.field?.maxLength ? F(Se) : F(Ue, !1);
																},
																!0
															);
														}
														r(C, D);
													};
												n(
													Be,
													(C) => {
														e.field?.count && e.field?.minLength ? C(qe) : C(De, !1);
													},
													!0
												);
											}
											r(O, q);
										};
									n(
										Ie,
										(O) => {
											e.field?.count && e.field?.maxLength ? O(ke) : O(Ae, !1);
										},
										!0
									);
								}
								r(V, B);
							};
						n(R, (V) => {
							e.field?.count && e.field?.minLength && e.field?.maxLength ? V(Me) : V(ze, !1);
						});
					}
					(x(m), d(() => se(m, 1, `badge mr-1 rounded-full ${a(_e) ?? ''}`)), r(w, m));
				};
				n(s, (w) => {
					(e.field?.count || e.field?.minLength || e.field?.maxLength) && w(c);
				});
			}
			var y = I(s, 2);
			{
				var W = (w) => {
					var m = ua(),
						R = h(m, !0);
					(x(m),
						d(() => {
							(u(m, 'aria-label', `${e.field.suffix} suffix`), o(R, e.field?.suffix));
						}),
						r(w, m));
				};
				n(y, (w) => {
					e.field?.suffix && w(W);
				});
			}
			(x(i), r(t, i));
		};
		n(ne, (t) => {
			(e.field?.suffix || e.field?.count || e.field?.minLength || e.field?.maxLength) && t(Ne);
		});
	}
	var Te = I(ne, 2);
	{
		var Ve = (t) => {
			var i = oa();
			r(t, i);
		};
		n(Te, (t) => {
			a(T) && t(Ve);
		});
	}
	x(Q);
	var de = I(Q, 2);
	{
		var Oe = (t) => {
			var i = va(),
				s = h(i, !0);
			(x(i),
				d(() => {
					(u(i, 'id', `${a(g)}-helper`), o(s, e.field.helper));
				}),
				r(t, i));
		};
		n(de, (t) => {
			e.field.helper && t(Oe);
		});
	}
	var Ce = I(de, 2);
	{
		var Fe = (t) => {
			var i = ca(),
				s = h(i, !0);
			(x(i),
				d(() => {
					(u(i, 'id', `${a(g)}-error`), o(s, a(v)));
				}),
				r(t, i));
		};
		n(Ce, (t) => {
			a(v) && t(Fe);
		});
	}
	return (
		x(J),
		d(() => {
			(ea(l, a(j)),
				u(l, 'name', e.field?.db_fieldName),
				u(l, 'id', e.field?.db_fieldName),
				u(l, 'placeholder', e.field?.placeholder && e.field?.placeholder !== '' ? e.field?.placeholder : e.field?.db_fieldName),
				(l.required = e.field?.required),
				(l.disabled = e.field?.disabled),
				(l.readOnly = e.field?.readonly),
				u(l, 'minlength', e.field?.minLength),
				u(l, 'maxlength', e.field?.maxLength),
				(le = se(l, 1, 'input w-full flex-1 rounded-none text-black dark:text-primary-500', null, le, {
					'!border-error-500': !!a(v),
					'!ring-1': !!a(v) || a(T),
					'!ring-error-500': !!a(v),
					'!border-primary-500': a(T) && !a(v),
					'!ring-primary-500': a(T) && !a(v)
				})),
				u(l, 'aria-invalid', !!a(v)),
				u(l, 'aria-describedby', a(v) ? `${a(g)}-error` : e.field.helper ? `${a(g)}-helper` : void 0),
				u(l, 'aria-required', e.field?.required));
		}),
		ue('blur', l, be),
		ue('focus', l, Le),
		r(oe, J),
		Ze(we)
	);
}
pe(['input']);
export { Oa as default };
//# sourceMappingURL=NlPuTG1s.js.map
