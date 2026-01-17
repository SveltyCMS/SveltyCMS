import { i as pe } from '../chunks/zi73tRJP.js';
import { o as ue } from '../chunks/CMZtchEj.js';
import { p as le, d as Z, x as de, s as C, f as ye, g as A, a as fe, b as v, c as ee, r as G, t as te } from '../chunks/DrlZFkx8.js';
import { f as J, a as U, s as re } from '../chunks/CTjXDULS.js';
import { e as me, i as ge } from '../chunks/BXe5mj2j.js';
import { l as we } from '../chunks/BvngfGKt.js';
function y(e) {
	return e === null ? 'null' : Array.isArray(e) ? 'array' : typeof e;
}
function S(e) {
	return y(e) === 'object';
}
function be(e) {
	return Array.isArray(e) && e.length > 0 && e.every((f) => 'message' in f);
}
function oe(e, f) {
	return e.length < 124 ? e : f;
}
const he = 'graphql-transport-ws';
var m = ((e) => (
		(e[(e.InternalServerError = 4500)] = 'InternalServerError'),
		(e[(e.InternalClientError = 4005)] = 'InternalClientError'),
		(e[(e.BadRequest = 4400)] = 'BadRequest'),
		(e[(e.BadResponse = 4004)] = 'BadResponse'),
		(e[(e.Unauthorized = 4401)] = 'Unauthorized'),
		(e[(e.Forbidden = 4403)] = 'Forbidden'),
		(e[(e.SubprotocolNotAcceptable = 4406)] = 'SubprotocolNotAcceptable'),
		(e[(e.ConnectionInitialisationTimeout = 4408)] = 'ConnectionInitialisationTimeout'),
		(e[(e.ConnectionAcknowledgementTimeout = 4504)] = 'ConnectionAcknowledgementTimeout'),
		(e[(e.SubscriberAlreadyExists = 4409)] = 'SubscriberAlreadyExists'),
		(e[(e.TooManyInitialisationRequests = 4429)] = 'TooManyInitialisationRequests'),
		e
	))(m || {}),
	g = ((e) => (
		(e.ConnectionInit = 'connection_init'),
		(e.ConnectionAck = 'connection_ack'),
		(e.Ping = 'ping'),
		(e.Pong = 'pong'),
		(e.Subscribe = 'subscribe'),
		(e.Next = 'next'),
		(e.Error = 'error'),
		(e.Complete = 'complete'),
		e
	))(g || {});
function ie(e) {
	if (!S(e)) throw new Error(`Message is expected to be an object, but got ${y(e)}`);
	if (!e.type) throw new Error("Message is missing the 'type' property");
	if (typeof e.type != 'string') throw new Error(`Message is expects the 'type' property to be a string, but got ${y(e.type)}`);
	switch (e.type) {
		case 'connection_init':
		case 'connection_ack':
		case 'ping':
		case 'pong': {
			if (e.payload != null && !S(e.payload))
				throw new Error(`"${e.type}" message expects the 'payload' property to be an object or nullish or missing, but got "${e.payload}"`);
			break;
		}
		case 'subscribe': {
			if (typeof e.id != 'string') throw new Error(`"${e.type}" message expects the 'id' property to be a string, but got ${y(e.id)}`);
			if (!e.id) throw new Error(`"${e.type}" message requires a non-empty 'id' property`);
			if (!S(e.payload)) throw new Error(`"${e.type}" message expects the 'payload' property to be an object, but got ${y(e.payload)}`);
			if (typeof e.payload.query != 'string')
				throw new Error(`"${e.type}" message payload expects the 'query' property to be a string, but got ${y(e.payload.query)}`);
			if (e.payload.variables != null && !S(e.payload.variables))
				throw new Error(
					`"${e.type}" message payload expects the 'variables' property to be a an object or nullish or missing, but got ${y(e.payload.variables)}`
				);
			if (e.payload.operationName != null && y(e.payload.operationName) !== 'string')
				throw new Error(
					`"${e.type}" message payload expects the 'operationName' property to be a string or nullish or missing, but got ${y(e.payload.operationName)}`
				);
			if (e.payload.extensions != null && !S(e.payload.extensions))
				throw new Error(
					`"${e.type}" message payload expects the 'extensions' property to be a an object or nullish or missing, but got ${y(e.payload.extensions)}`
				);
			break;
		}
		case 'next': {
			if (typeof e.id != 'string') throw new Error(`"${e.type}" message expects the 'id' property to be a string, but got ${y(e.id)}`);
			if (!e.id) throw new Error(`"${e.type}" message requires a non-empty 'id' property`);
			if (!S(e.payload)) throw new Error(`"${e.type}" message expects the 'payload' property to be an object, but got ${y(e.payload)}`);
			break;
		}
		case 'error': {
			if (typeof e.id != 'string') throw new Error(`"${e.type}" message expects the 'id' property to be a string, but got ${y(e.id)}`);
			if (!e.id) throw new Error(`"${e.type}" message requires a non-empty 'id' property`);
			if (!be(e.payload))
				throw new Error(`"${e.type}" message expects the 'payload' property to be an array of GraphQL errors, but got ${JSON.stringify(e.payload)}`);
			break;
		}
		case 'complete': {
			if (typeof e.id != 'string') throw new Error(`"${e.type}" message expects the 'id' property to be a string, but got ${y(e.id)}`);
			if (!e.id) throw new Error(`"${e.type}" message requires a non-empty 'id' property`);
			break;
		}
		default:
			throw new Error(`Invalid message 'type' property "${e.type}"`);
	}
	return e;
}
function xe(e, f) {
	return ie(typeof e == 'string' ? JSON.parse(e, f) : e);
}
function W(e, f) {
	return (ie(e), JSON.stringify(e, f));
}
function Ee(e) {
	const {
		url: f,
		connectionParams: b,
		lazy: P = !0,
		onNonLazyError: M = console.error,
		lazyCloseTimeout: k = 0,
		keepAlive: R = 0,
		disablePong: z,
		connectionAckWaitTimeout: w = 0,
		retryAttempts: l = 5,
		retryWait: h = async function (i) {
			const t = Math.pow(2, i);
			await new Promise((o) => setTimeout(o, t * 1e3 + Math.floor(Math.random() * 2700 + 300)));
		},
		shouldRetry: O = D,
		on: c,
		webSocketImpl: F,
		generateID: se = function () {
			return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (i) => {
				const t = (Math.random() * 16) | 0;
				return (i == 'x' ? t : (t & 3) | 8).toString(16);
			});
		},
		jsonMessageReplacer: j,
		jsonMessageReviver: ae
	} = e;
	let $;
	if (F) {
		if (!ke(F)) throw new Error('Invalid WebSocket implementation provided');
		$ = F;
	} else
		typeof WebSocket < 'u'
			? ($ = WebSocket)
			: typeof global < 'u'
				? ($ = global.WebSocket || global.MozWebSocket)
				: typeof window < 'u' && ($ = window.WebSocket || window.MozWebSocket);
	if (!$)
		throw new Error(
			"WebSocket implementation missing; on Node you can `import WebSocket from 'ws';` and pass `webSocketImpl: WebSocket` to `createClient`"
		);
	const N = $,
		p = (() => {
			const r = (() => {
					const t = {};
					return {
						on(o, s) {
							return (
								(t[o] = s),
								() => {
									delete t[o];
								}
							);
						},
						emit(o) {
							'id' in o && t[o.id]?.(o);
						}
					};
				})(),
				i = {
					connecting: c?.connecting ? [c.connecting] : [],
					opened: c?.opened ? [c.opened] : [],
					connected: c?.connected ? [c.connected] : [],
					ping: c?.ping ? [c.ping] : [],
					pong: c?.pong ? [c.pong] : [],
					message: c?.message ? [r.emit, c.message] : [r.emit],
					closed: c?.closed ? [c.closed] : [],
					error: c?.error ? [c.error] : []
				};
			return {
				onMessage: r.on,
				on(t, o) {
					const s = i[t];
					return (
						s.push(o),
						() => {
							s.splice(s.indexOf(o), 1);
						}
					);
				},
				emit(t, ...o) {
					for (const s of [...i[t]]) s(...o);
				}
			};
		})();
	function Q(r) {
		const i = [
			p.on('error', (t) => {
				(i.forEach((o) => o()), r(t));
			}),
			p.on('closed', (t) => {
				(i.forEach((o) => o()), r(t));
			})
		];
	}
	let x,
		E = 0,
		H,
		_ = !1,
		L = 0,
		K = !1;
	async function V() {
		clearTimeout(H);
		const [r, i] = await (x ??
			(x = new Promise((s, d) =>
				(async () => {
					if (_) {
						if ((await h(L), !E)) return ((x = void 0), d({ code: 1e3, reason: 'All Subscriptions Gone' }));
						L++;
					}
					p.emit('connecting', _);
					const n = new N(typeof f == 'function' ? await f() : f, he);
					let T, q;
					function B() {
						isFinite(R) &&
							R > 0 &&
							(clearTimeout(q),
							(q = setTimeout(() => {
								n.readyState === N.OPEN && (n.send(W({ type: g.Ping })), p.emit('ping', !1, void 0));
							}, R)));
					}
					(Q((u) => {
						((x = void 0),
							clearTimeout(T),
							clearTimeout(q),
							d(u),
							u instanceof ne && (n.close(4499, 'Terminated'), (n.onerror = null), (n.onclose = null)));
					}),
						(n.onerror = (u) => p.emit('error', u)),
						(n.onclose = (u) => p.emit('closed', u)),
						(n.onopen = async () => {
							try {
								p.emit('opened', n);
								const u = typeof b == 'function' ? await b() : b;
								if (n.readyState !== N.OPEN) return;
								(n.send(W(u ? { type: g.ConnectionInit, payload: u } : { type: g.ConnectionInit }, j)),
									isFinite(w) &&
										w > 0 &&
										(T = setTimeout(() => {
											n.close(m.ConnectionAcknowledgementTimeout, 'Connection acknowledgement timeout');
										}, w)),
									B());
							} catch (u) {
								(p.emit('error', u), n.close(m.InternalClientError, oe(u instanceof Error ? u.message : String(u), 'Internal client error')));
							}
						}));
					let I = !1;
					n.onmessage = ({ data: u }) => {
						try {
							const a = xe(u, ae);
							if ((p.emit('message', a), a.type === 'ping' || a.type === 'pong')) {
								(p.emit(a.type, !0, a.payload),
									a.type === 'pong'
										? B()
										: z || (n.send(W(a.payload ? { type: g.Pong, payload: a.payload } : { type: g.Pong })), p.emit('pong', !1, a.payload)));
								return;
							}
							if (I) return;
							if (a.type !== g.ConnectionAck) throw new Error(`First message cannot be of type ${a.type}`);
							(clearTimeout(T), (I = !0), p.emit('connected', n, a.payload, _), (_ = !1), (L = 0), s([n, new Promise((Ie, ce) => Q(ce))]));
						} catch (a) {
							((n.onmessage = null), p.emit('error', a), n.close(m.BadResponse, oe(a instanceof Error ? a.message : String(a), 'Bad response')));
						}
					};
				})()
			)));
		r.readyState === N.CLOSING && (await i);
		let t = () => {};
		const o = new Promise((s) => (t = s));
		return [
			r,
			t,
			Promise.race([
				o.then(() => {
					if (!E) {
						const s = () => r.close(1e3, 'Normal Closure');
						isFinite(k) && k > 0
							? (H = setTimeout(() => {
									r.readyState === N.OPEN && s();
								}, k))
							: s();
					}
				}),
				i
			])
		];
	}
	function X(r) {
		if (
			D(r) &&
			(Se(r.code) ||
				[
					m.InternalServerError,
					m.InternalClientError,
					m.BadRequest,
					m.BadResponse,
					m.Unauthorized,
					m.SubprotocolNotAcceptable,
					m.SubscriberAlreadyExists,
					m.TooManyInitialisationRequests
				].includes(r.code))
		)
			throw r;
		if (K) return !1;
		if (D(r) && r.code === 1e3) return E > 0;
		if (!l || L >= l || !O(r)) throw r;
		return (_ = !0);
	}
	P ||
		(async () => {
			for (E++; ; )
				try {
					const [, , r] = await V();
					await r;
				} catch (r) {
					try {
						if (!X(r)) return;
					} catch (i) {
						return M?.(i);
					}
				}
		})();
	function Y(r, i) {
		const t = se(r);
		let o = !1,
			s = !1,
			d = () => {
				(E--, (o = !0));
			};
		return (
			(async () => {
				for (E++; ; )
					try {
						const [n, T, q] = await V();
						if (o) return T();
						const B = p.onMessage(t, (I) => {
							switch (I.type) {
								case g.Next: {
									i.next(I.payload);
									return;
								}
								case g.Error: {
									((s = !0), (o = !0), i.error(I.payload), d());
									return;
								}
								case g.Complete: {
									((o = !0), d());
									return;
								}
							}
						});
						(n.send(W({ id: t, type: g.Subscribe, payload: r }, j)),
							(d = () => {
								(!o && n.readyState === N.OPEN && n.send(W({ id: t, type: g.Complete }, j)), E--, (o = !0), T());
							}),
							await q.finally(B));
						return;
					} catch (n) {
						if (!X(n)) return;
					}
			})()
				.then(() => {
					s || i.complete();
				})
				.catch((n) => {
					i.error(n);
				}),
			() => {
				o || d();
			}
		);
	}
	return {
		on: p.on,
		subscribe: Y,
		iterate(r) {
			const i = [],
				t = { done: !1, error: null, resolve: () => {} },
				o = Y(r, {
					next(d) {
						(i.push(d), t.resolve());
					},
					error(d) {
						((t.done = !0), (t.error = d), t.resolve());
					},
					complete() {
						((t.done = !0), t.resolve());
					}
				}),
				s = (async function* () {
					for (;;) {
						for (i.length || (await new Promise((n) => (t.resolve = n))); i.length; ) yield i.shift();
						if (t.error) throw t.error;
						if (t.done) return;
					}
				})();
			return (
				(s.throw = async (d) => (t.done || ((t.done = !0), (t.error = d), t.resolve()), { done: !0, value: void 0 })),
				(s.return = async () => (o(), { done: !0, value: void 0 })),
				s
			);
		},
		async dispose() {
			if (((K = !0), x)) {
				const [r] = await x;
				r.close(1e3, 'Normal Closure');
			}
		},
		terminate() {
			x && p.emit('closed', new ne());
		}
	};
}
class ne extends Error {
	name = 'TerminatedCloseEvent';
	message = '4499: Terminated';
	code = 4499;
	reason = 'Terminated';
	wasClean = !1;
}
function D(e) {
	return S(e) && 'code' in e && 'reason' in e;
}
function Se(e) {
	return [1e3, 1001, 1006, 1005, 1012, 1013, 1014].includes(e) ? !1 : e >= 1e3 && e <= 1999;
}
function ke(e) {
	return typeof e == 'function' && 'constructor' in e && 'CLOSED' in e && 'CLOSING' in e && 'CONNECTING' in e && 'OPEN' in e;
}
var $e = J('<p style="color: red"> </p>'),
	Ne = J('<li> </li>'),
	Te = J('<h1>GraphQL Subscription Test</h1> <!> <h2>New Posts:</h2> <ul></ul>', 1);
function We(e, f) {
	le(f, !0);
	let b = Z(de([])),
		P = Z(null);
	ue(() => {
		Ee({ url: 'ws://localhost:3001/api/graphql' }).subscribe(
			{
				query: `
					subscription PostAdded {
						postAdded {
							_id
							title
						}
					}
				`
			},
			{
				next: (l) => {
					l?.data?.postAdded && v(b, [...A(b), l.data.postAdded], !0);
				},
				error: (l) => {
					v(P, l, !0);
				},
				complete: () => {
					we.debug('Subscription complete');
				}
			}
		);
	});
	var M = Te(),
		k = C(ye(M), 2);
	{
		var R = (w) => {
			var l = $e(),
				h = ee(l, !0);
			(G(l), te((O) => re(h, O), [() => JSON.stringify(A(P), null, 2)]), U(w, l));
		};
		pe(k, (w) => {
			A(P) && w(R);
		});
	}
	var z = C(k, 4);
	(me(
		z,
		21,
		() => A(b),
		ge,
		(w, l) => {
			var h = Ne(),
				O = ee(h);
			(G(h), te(() => re(O, `${A(l).title ?? ''} (${A(l)._id ?? ''})`)), U(w, h));
		}
	),
		G(z),
		U(e, M),
		fe());
}
export { We as component };
//# sourceMappingURL=18.BitMmASG.js.map
