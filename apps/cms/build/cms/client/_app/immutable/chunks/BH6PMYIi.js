function gt(e, t) {
	var r = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var n = Object.getOwnPropertySymbols(e);
		(t &&
			(n = n.filter(function (a) {
				return Object.getOwnPropertyDescriptor(e, a).enumerable;
			})),
			r.push.apply(r, n));
	}
	return r;
}
function xe(e) {
	for (var t = 1; t < arguments.length; t++) {
		var r = arguments[t] != null ? arguments[t] : {};
		t % 2
			? gt(Object(r), !0).forEach(function (n) {
					ne(e, n, r[n]);
				})
			: Object.getOwnPropertyDescriptors
				? Object.defineProperties(e, Object.getOwnPropertyDescriptors(r))
				: gt(Object(r)).forEach(function (n) {
						Object.defineProperty(e, n, Object.getOwnPropertyDescriptor(r, n));
					});
	}
	return e;
}
function ee(e) {
	'@babel/helpers - typeof';
	return (
		(ee =
			typeof Symbol == 'function' && typeof Symbol.iterator == 'symbol'
				? function (t) {
						return typeof t;
					}
				: function (t) {
						return t && typeof Symbol == 'function' && t.constructor === Symbol && t !== Symbol.prototype ? 'symbol' : typeof t;
					}),
		ee(e)
	);
}
function ne(e, t, r) {
	return (t in e ? Object.defineProperty(e, t, { value: r, enumerable: !0, configurable: !0, writable: !0 }) : (e[t] = r), e);
}
function Zt(e, t) {
	if (e == null) return {};
	var r = {},
		n = Object.keys(e),
		a,
		i;
	for (i = 0; i < n.length; i++) ((a = n[i]), !(t.indexOf(a) >= 0) && (r[a] = e[a]));
	return r;
}
function jt(e, t) {
	if (e == null) return {};
	var r = Zt(e, t),
		n,
		a;
	if (Object.getOwnPropertySymbols) {
		var i = Object.getOwnPropertySymbols(e);
		for (a = 0; a < i.length; a++) ((n = i[a]), !(t.indexOf(n) >= 0) && Object.prototype.propertyIsEnumerable.call(e, n) && (r[n] = e[n]));
	}
	return r;
}
function Yt(e, t) {
	return Kt(e) || qt(e, t) || nt(e, t) || Qt();
}
function F(e) {
	return Vt(e) || Xt(e) || nt(e) || Jt();
}
function Vt(e) {
	if (Array.isArray(e)) return Ve(e);
}
function Kt(e) {
	if (Array.isArray(e)) return e;
}
function Xt(e) {
	if ((typeof Symbol < 'u' && e[Symbol.iterator] != null) || e['@@iterator'] != null) return Array.from(e);
}
function qt(e, t) {
	var r = e == null ? null : (typeof Symbol < 'u' && e[Symbol.iterator]) || e['@@iterator'];
	if (r != null) {
		var n = [],
			a = !0,
			i = !1,
			d,
			u;
		try {
			for (r = r.call(e); !(a = (d = r.next()).done) && (n.push(d.value), !(t && n.length === t)); a = !0);
		} catch (l) {
			((i = !0), (u = l));
		} finally {
			try {
				!a && r.return != null && r.return();
			} finally {
				if (i) throw u;
			}
		}
		return n;
	}
}
function nt(e, t) {
	if (e) {
		if (typeof e == 'string') return Ve(e, t);
		var r = Object.prototype.toString.call(e).slice(8, -1);
		if ((r === 'Object' && e.constructor && (r = e.constructor.name), r === 'Map' || r === 'Set')) return Array.from(e);
		if (r === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)) return Ve(e, t);
	}
}
function Ve(e, t) {
	(t == null || t > e.length) && (t = e.length);
	for (var r = 0, n = new Array(t); r < t; r++) n[r] = e[r];
	return n;
}
function Jt() {
	throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
function Qt() {
	throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
function Ee(e, t) {
	var r = (typeof Symbol < 'u' && e[Symbol.iterator]) || e['@@iterator'];
	if (!r) {
		if (Array.isArray(e) || (r = nt(e)) || t) {
			r && (e = r);
			var n = 0,
				a = function () {};
			return {
				s: a,
				n: function () {
					return n >= e.length ? { done: !0 } : { done: !1, value: e[n++] };
				},
				e: function (l) {
					throw l;
				},
				f: a
			};
		}
		throw new TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
	}
	var i = !0,
		d = !1,
		u;
	return {
		s: function () {
			r = r.call(e);
		},
		n: function () {
			var l = r.next();
			return ((i = l.done), l);
		},
		e: function (l) {
			((d = !0), (u = l));
		},
		f: function () {
			try {
				!i && r.return != null && r.return();
			} finally {
				if (d) throw u;
			}
		}
	};
}
var er = 'finalize',
	tr = 'consider';
function ie(e, t, r) {
	e.dispatchEvent(new CustomEvent(er, { detail: { items: t, info: r } }));
}
function K(e, t, r) {
	e.dispatchEvent(new CustomEvent(tr, { detail: { items: t, info: r } }));
}
var ze = 'draggedEntered',
	Te = 'draggedLeft',
	ke = 'draggedOverIndex',
	it = 'draggedLeftDocument',
	Ne = { LEFT_FOR_ANOTHER: 'leftForAnother', OUTSIDE_OF_ANY: 'outsideOfAny' };
function rr(e, t, r) {
	e.dispatchEvent(new CustomEvent(ze, { detail: { indexObj: t, draggedEl: r } }));
}
function nr(e, t, r) {
	e.dispatchEvent(new CustomEvent(Te, { detail: { draggedEl: t, type: Ne.LEFT_FOR_ANOTHER, theOtherDz: r } }));
}
function ir(e, t) {
	e.dispatchEvent(new CustomEvent(Te, { detail: { draggedEl: t, type: Ne.OUTSIDE_OF_ANY } }));
}
function ar(e, t, r) {
	e.dispatchEvent(new CustomEvent(ke, { detail: { indexObj: t, draggedEl: r } }));
}
function or(e) {
	window.dispatchEvent(new CustomEvent(it, { detail: { draggedEl: e } }));
}
var R = {
		DRAG_STARTED: 'dragStarted',
		DRAGGED_ENTERED: ze,
		DRAGGED_ENTERED_ANOTHER: 'dragEnteredAnother',
		DRAGGED_OVER_INDEX: ke,
		DRAGGED_LEFT: Te,
		DRAGGED_LEFT_ALL: 'draggedLeftAll',
		DROPPED_INTO_ZONE: 'droppedIntoZone',
		DROPPED_INTO_ANOTHER: 'droppedIntoAnother',
		DROPPED_OUTSIDE_OF_ANY: 'droppedOutsideOfAny',
		DRAG_STOPPED: 'dragStopped'
	},
	N = { POINTER: 'pointer', KEYBOARD: 'keyboard' },
	Ue = 'isDndShadowItem',
	$e = 'data-is-dnd-shadow-item-internal',
	sr = 'data-is-dnd-shadow-item-hint',
	_t = 'id:dnd-shadow-placeholder-0000',
	dr = 'dnd-action-dragged-el',
	w = 'id',
	Ke = 0;
function At() {
	Ke++;
}
function It() {
	if (Ke === 0) throw new Error('Bug! trying to decrement when there are no dropzones');
	Ke--;
}
var at = typeof window > 'u';
function Xe(e) {
	var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : !0,
		r,
		n = t ? fr(e) : e.getBoundingClientRect(),
		a = getComputedStyle(e),
		i = a.transform;
	if (i) {
		var d, u, l, g;
		if (i.startsWith('matrix3d(')) ((r = i.slice(9, -1).split(/, /)), (d = +r[0]), (u = +r[5]), (l = +r[12]), (g = +r[13]));
		else if (i.startsWith('matrix(')) ((r = i.slice(7, -1).split(/, /)), (d = +r[0]), (u = +r[3]), (l = +r[4]), (g = +r[5]));
		else return n;
		var o = a.transformOrigin,
			v = n.x - l - (1 - d) * parseFloat(o),
			s = n.y - g - (1 - u) * parseFloat(o.slice(o.indexOf(' ') + 1)),
			f = d ? n.width / d : e.offsetWidth,
			c = u ? n.height / u : e.offsetHeight;
		return { x: v, y: s, width: f, height: c, top: s, right: v + f, bottom: s + c, left: v };
	} else return n;
}
function qe(e) {
	var t = Xe(e);
	return { top: t.top + window.scrollY, bottom: t.bottom + window.scrollY, left: t.left + window.scrollX, right: t.right + window.scrollX };
}
function St(e) {
	var t = e.getBoundingClientRect();
	return { top: t.top + window.scrollY, bottom: t.bottom + window.scrollY, left: t.left + window.scrollX, right: t.right + window.scrollX };
}
function Rt(e) {
	return { x: (e.left + e.right) / 2, y: (e.top + e.bottom) / 2 };
}
function ur(e, t) {
	return Math.sqrt(Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2));
}
function pe(e, t) {
	return e.y <= t.bottom && e.y >= t.top && e.x >= t.left && e.x <= t.right;
}
function Ct(e) {
	return Rt(St(e));
}
function vt(e, t) {
	var r = Ct(t);
	return ur(e, r);
}
function lr(e) {
	var t = St(e);
	return t.right < 0 || t.left > document.documentElement.scrollWidth || t.bottom < 0 || t.top > document.documentElement.scrollHeight;
}
function fr(e) {
	for (
		var t = e.getBoundingClientRect(), r = { top: t.top, bottom: t.bottom, left: t.left, right: t.right }, n = !1, a = !1, i = e.parentElement;
		i && i !== document.body;
	) {
		var d = window.getComputedStyle(i),
			u = d.overflowY,
			l = d.overflowX,
			g = u === 'scroll' || u === 'auto',
			o = l === 'scroll' || l === 'auto';
		if (g || o) {
			var v = i.getBoundingClientRect();
			if (g) {
				var s = Math.max(r.top, v.top),
					f = Math.min(r.bottom, v.bottom);
				((s !== r.top || f !== r.bottom) && (n = !0), (r.top = s), (r.bottom = f));
			}
			if (o) {
				var c = Math.max(r.left, v.left),
					p = Math.min(r.right, v.right);
				((c !== r.left || p !== r.right) && (a = !0), (r.left = c), (r.right = p));
			}
		}
		i = i.parentElement;
	}
	return n || a
		? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: Math.max(0, r.right - r.left), height: Math.max(0, r.bottom - r.top) }
		: { top: t.top, bottom: t.bottom, left: t.left, right: t.right, width: Math.max(0, t.right - t.left), height: Math.max(0, t.bottom - t.top) };
}
var te;
function ot() {
	te = new Map();
}
ot();
function cr(e) {
	var t = Array.from(e.children).findIndex(function (r) {
		return r.getAttribute($e);
	});
	if (t >= 0) return (te.has(e) || te.set(e, new Map()), te.get(e).set(t, qe(e.children[t])), t);
}
function gr(e, t) {
	var r = qe(t);
	if (!pe(e, r)) return null;
	var n = t.children;
	if (n.length === 0) return { index: 0, isProximityBased: !0 };
	for (var a = cr(t), i = 0; i < n.length; i++) {
		var d = qe(n[i]);
		if (pe(e, d)) {
			var u = te.has(t) && te.get(t).get(i);
			return u && !pe(e, u) ? { index: a, isProximityBased: !1 } : { index: i, isProximityBased: !1 };
		}
	}
	for (var l = Number.MAX_VALUE, g = void 0, o = 0; o < n.length; o++) {
		var v = vt(e, n[o]);
		v < l && ((l = v), (g = o));
	}
	if (n.length > 0) {
		var s = n.length,
			f = n[s - 1],
			c = f.cloneNode(!1);
		((c.style.visibility = 'hidden'), (c.style.pointerEvents = 'none'), t.appendChild(c));
		var p = vt(e, c);
		(p < l && (g = s), t.removeChild(c));
	}
	return { index: g, isProximityBased: !0 };
}
function ge(e) {
	return JSON.stringify(e, null, 2);
}
function Me(e) {
	if (!e) throw new Error('cannot get depth of a falsy node');
	return xt(e, 0);
}
function xt(e) {
	var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
	return e.parentElement ? xt(e.parentElement, t + 1) : t - 1;
}
function vr(e, t) {
	if (Object.keys(e).length !== Object.keys(t).length) return !1;
	for (var r in e) if (!{}.hasOwnProperty.call(t, r) || t[r] !== e[r]) return !1;
	return !0;
}
function mr(e, t) {
	if (e.length !== t.length) return !1;
	for (var r = 0; r < e.length; r++) if (e[r] !== t[r]) return !1;
	return !0;
}
var pr = 200,
	mt = 10,
	Je;
function hr(e, t) {
	var r = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : pr,
		n = arguments.length > 3 ? arguments[3] : void 0,
		a = arguments.length > 4 ? arguments[4] : void 0,
		i,
		d,
		u = !1,
		l,
		g = Array.from(t).sort(function (v, s) {
			return Me(s) - Me(v);
		});
	function o() {
		var v = a(),
			s = n.multiScrollIfNeeded();
		if (!s && l && Math.abs(l.x - v.x) < mt && Math.abs(l.y - v.y) < mt) {
			Je = window.setTimeout(o, r);
			return;
		}
		if (lr(e)) {
			or(e);
			return;
		}
		l = v;
		var f = !1,
			c = Ee(g),
			p;
		try {
			for (c.s(); !(p = c.n()).done; ) {
				var h = p.value;
				s && ot();
				var D = gr(v, h);
				if (D !== null) {
					var T = D.index;
					((f = !0), h !== i ? (i && nr(i, e, h), rr(h, D, e), (i = h)) : T !== d && (ar(h, D, e), (d = T)));
					break;
				}
			}
		} catch (M) {
			c.e(M);
		} finally {
			c.f();
		}
		(!f && u && i ? (ir(i, e), (i = void 0), (d = void 0), (u = !1)) : (u = !0), (Je = window.setTimeout(o, r)));
	}
	o();
}
function yr() {
	(clearTimeout(Je), ot());
}
var ve = 30;
function Dr() {
	var e;
	function t() {
		e = { directionObj: void 0, stepPx: 0 };
	}
	t();
	function r(i) {
		var d = e,
			u = d.directionObj,
			l = d.stepPx;
		u &&
			(i.scrollBy(u.x * l, u.y * l),
			window.requestAnimationFrame(function () {
				return r(i);
			}));
	}
	function n(i) {
		return ve - i;
	}
	function a(i, d) {
		if (!d) return !1;
		var u = Er(i, d),
			l = !!e.directionObj;
		if (u === null) return (l && t(), !1);
		var g = !1,
			o = !1;
		return (d.scrollHeight > d.clientHeight &&
			(u.bottom < ve
				? ((g = !0), (e.directionObj = { x: 0, y: 1 }), (e.stepPx = n(u.bottom)))
				: u.top < ve && ((g = !0), (e.directionObj = { x: 0, y: -1 }), (e.stepPx = n(u.top))),
			!l && g)) ||
			(d.scrollWidth > d.clientWidth &&
				(u.right < ve
					? ((o = !0), (e.directionObj = { x: 1, y: 0 }), (e.stepPx = n(u.right)))
					: u.left < ve && ((o = !0), (e.directionObj = { x: -1, y: 0 }), (e.stepPx = n(u.left))),
				!l && o))
			? (r(d), !0)
			: (t(), !1);
	}
	return { scrollIfNeeded: a, resetScrolling: t };
}
function Er(e, t) {
	var r = t === document.scrollingElement ? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth } : t.getBoundingClientRect();
	return pe(e, r) ? { top: e.y - r.top, bottom: r.bottom - e.y, left: e.x - r.left, right: r.right - e.x } : null;
}
function Tr() {
	var e = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : [],
		t = arguments.length > 1 ? arguments[1] : void 0,
		r = wr(e),
		n = Array.from(r).sort(function (l, g) {
			return Me(g) - Me(l);
		}),
		a = Dr(),
		i = a.scrollIfNeeded,
		d = a.resetScrolling;
	function u() {
		var l = t();
		if (!l || !n) return !1;
		for (
			var g = n.filter(function (s) {
					return pe(l, s.getBoundingClientRect()) || s === document.scrollingElement;
				}),
				o = 0;
			o < g.length;
			o++
		) {
			var v = i(l, g[o]);
			if (v) return !0;
		}
		return !1;
	}
	return {
		multiScrollIfNeeded:
			r.size > 0
				? u
				: function () {
						return !1;
					},
		destroy: function () {
			return d();
		}
	};
}
function br(e) {
	if (!e) return [];
	for (var t = [], r = e; r; ) {
		var n = window.getComputedStyle(r),
			a = n.overflow;
		(a.split(' ').some(function (i) {
			return i.includes('auto') || i.includes('scroll');
		}) && t.push(r),
			(r = r.parentElement));
	}
	return t;
}
function wr(e) {
	var t = new Set(),
		r = Ee(e),
		n;
	try {
		for (r.s(); !(n = r.n()).done; ) {
			var a = n.value;
			br(a).forEach(function (i) {
				return t.add(i);
			});
		}
	} catch (i) {
		r.e(i);
	} finally {
		r.f();
	}
	return (
		(document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight ||
			document.scrollingElement.scrollWidth > document.scrollingElement.clientHeight) &&
			t.add(document.scrollingElement),
		t
	);
}
function Or(e) {
	var t = e.cloneNode(!0),
		r = [],
		n = e.tagName === 'SELECT',
		a = n ? [e] : F(e.querySelectorAll('select')),
		i = Ee(a),
		d;
	try {
		for (i.s(); !(d = i.n()).done; ) {
			var u = d.value;
			r.push(u.value);
		}
	} catch (M) {
		i.e(M);
	} finally {
		i.f();
	}
	if (a.length > 0)
		for (var l = n ? [t] : F(t.querySelectorAll('select')), g = 0; g < l.length; g++) {
			var o = l[g],
				v = r[g],
				s = o.querySelector('option[value="'.concat(v, '"'));
			s && s.setAttribute('selected', !0);
		}
	var f = e.tagName === 'CANVAS',
		c = f ? [e] : F(e.querySelectorAll('canvas'));
	if (c.length > 0)
		for (var p = f ? [t] : F(t.querySelectorAll('canvas')), h = 0; h < p.length; h++) {
			var D = c[h],
				T = p[h];
			((T.width = D.width), (T.height = D.height), D.width > 0 && D.height > 0 && T.getContext('2d').drawImage(D, 0, 0));
		}
	return t;
}
var ye = Object.freeze({ USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT: 'USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT' }),
	_r = ne({}, ye.USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT, !1);
function Nt(e) {
	if (!ye[e]) throw new Error("Can't get non existing feature flag ".concat(e, '! Supported flags: ').concat(Object.keys(ye)));
	return _r[e];
}
var Ar = 0.2;
function X(e) {
	return ''.concat(e, ' ').concat(Ar, 's ease');
}
function Ir(e, t) {
	var r = e.getBoundingClientRect(),
		n = Or(e);
	(Mt(e, n), (n.id = dr), (n.style.position = 'fixed'));
	var a = r.top,
		i = r.left;
	if (((n.style.top = ''.concat(a, 'px')), (n.style.left = ''.concat(i, 'px')), t)) {
		var d = Rt(r);
		((a -= d.y - t.y),
			(i -= d.x - t.x),
			window.setTimeout(function () {
				((n.style.top = ''.concat(a, 'px')), (n.style.left = ''.concat(i, 'px')));
			}, 0));
	}
	return (
		(n.style.margin = '0'),
		(n.style.boxSizing = 'border-box'),
		(n.style.height = ''.concat(r.height, 'px')),
		(n.style.width = ''.concat(r.width, 'px')),
		(n.style.transition = ''
			.concat(X('top'), ', ')
			.concat(X('left'), ', ')
			.concat(X('background-color'), ', ')
			.concat(X('opacity'), ', ')
			.concat(X('color'), ' ')),
		window.setTimeout(function () {
			return (n.style.transition += ', '.concat(X('width'), ', ').concat(X('height')));
		}, 0),
		(n.style.zIndex = '9999'),
		(n.style.cursor = 'grabbing'),
		n
	);
}
function Sr(e) {
	e.style.cursor = 'grab';
}
function Rr(e, t, r, n) {
	Mt(t, e);
	var a = t.getBoundingClientRect(),
		i = e.getBoundingClientRect(),
		d = a.width - i.width,
		u = a.height - i.height;
	if (d || u) {
		var l = { left: (r - i.left) / i.width, top: (n - i.top) / i.height };
		(Nt(ye.USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT) || ((e.style.height = ''.concat(a.height, 'px')), (e.style.width = ''.concat(a.width, 'px'))),
			(e.style.left = ''.concat(parseFloat(e.style.left) - l.left * d, 'px')),
			(e.style.top = ''.concat(parseFloat(e.style.top) - l.top * u, 'px')));
	}
}
function Mt(e, t) {
	var r = window.getComputedStyle(e);
	Array.from(r)
		.filter(function (n) {
			return (
				n.startsWith('background') ||
				n.startsWith('padding') ||
				n.startsWith('font') ||
				n.startsWith('text') ||
				n.startsWith('align') ||
				n.startsWith('justify') ||
				n.startsWith('display') ||
				n.startsWith('flex') ||
				n.startsWith('border') ||
				n === 'opacity' ||
				n === 'color' ||
				n === 'list-style-type' ||
				(Nt(ye.USE_COMPUTED_STYLE_INSTEAD_OF_BOUNDING_RECT) && (n === 'width' || n === 'height'))
			);
		})
		.forEach(function (n) {
			return t.style.setProperty(n, r.getPropertyValue(n), r.getPropertyPriority(n));
		});
}
function Cr(e, t) {
	((e.draggable = !1),
		(e.ondragstart = function () {
			return !1;
		}),
		t
			? ((e.style.userSelect = ''), (e.style.WebkitUserSelect = ''), (e.style.cursor = ''))
			: ((e.style.userSelect = 'none'), (e.style.WebkitUserSelect = 'none'), (e.style.cursor = 'grab')));
}
function Lt(e) {
	((e.style.display = 'none'), (e.style.position = 'fixed'), (e.style.zIndex = '-5'));
}
function xr(e) {
	((e.style.visibility = 'hidden'), e.setAttribute($e, 'true'));
}
function Nr(e) {
	((e.style.visibility = ''), e.removeAttribute($e));
}
function Re(e) {
	var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : function () {},
		r =
			arguments.length > 2 && arguments[2] !== void 0
				? arguments[2]
				: function () {
						return [];
					};
	e.forEach(function (n) {
		var a = t(n);
		(Object.keys(a).forEach(function (i) {
			n.style[i] = a[i];
		}),
			r(n).forEach(function (i) {
				return n.classList.add(i);
			}));
	});
}
function Le(e) {
	var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : function () {},
		r =
			arguments.length > 2 && arguments[2] !== void 0
				? arguments[2]
				: function () {
						return [];
					};
	e.forEach(function (n) {
		var a = t(n);
		(Object.keys(a).forEach(function (i) {
			n.style[i] = '';
		}),
			r(n).forEach(function (i) {
				return n.classList.contains(i) && n.classList.remove(i);
			}));
	});
}
function Mr(e) {
	var t = e.style.minHeight;
	e.style.minHeight = window.getComputedStyle(e).getPropertyValue('height');
	var r = e.style.minWidth;
	return (
		(e.style.minWidth = window.getComputedStyle(e).getPropertyValue('width')),
		function () {
			((e.style.minHeight = t), (e.style.minWidth = r));
		}
	);
}
var Lr = '--any--',
	Pr = 100,
	Fr = 20,
	Ie = 3,
	Gr = 80,
	pt = { outline: 'rgba(255, 255, 102, 0.7) solid 2px' },
	ht = 'data-is-dnd-original-dragged-item',
	C,
	b,
	x,
	We,
	m,
	Be,
	V,
	A,
	$,
	O,
	j = !1,
	st = !1,
	dt,
	be = !1,
	Ce = [],
	he,
	W,
	me = !1,
	ut = !1,
	k = new Map(),
	y = new Map(),
	Ye = new WeakMap();
function zr(e, t) {
	(k.has(t) || k.set(t, new Set()), k.get(t).has(e) || (k.get(t).add(e), At()));
}
function yt(e, t) {
	(k.get(t).delete(e), It(), k.get(t).size === 0 && k.delete(t));
}
function kr() {
	var e = k.get(We),
		t = Ee(e),
		r;
	try {
		for (t.s(); !(r = t.n()).done; ) {
			var n = r.value;
			(n.addEventListener(ze, Pt), n.addEventListener(Te, Ft), n.addEventListener(ke, Gt));
		}
	} catch (u) {
		t.e(u);
	} finally {
		t.f();
	}
	window.addEventListener(it, ae);
	var a = Math.max.apply(
			Math,
			F(
				Array.from(e.keys()).map(function (u) {
					return y.get(u).dropAnimationDurationMs;
				})
			)
		),
		i = a === 0 ? Fr : Math.max(a, Pr);
	he = Tr(e, function () {
		return O;
	});
	var d = ut
		? function () {
				return { x: O.x + window.scrollX, y: O.y + window.scrollY };
			}
		: function () {
				return Ct(b);
			};
	hr(b, e, i * 1.07, he, d);
}
function Ur() {
	var e = k.get(We),
		t = Ee(e),
		r;
	try {
		for (t.s(); !(r = t.n()).done; ) {
			var n = r.value;
			(n.removeEventListener(ze, Pt), n.removeEventListener(Te, Ft), n.removeEventListener(ke, Gt));
		}
	} catch (a) {
		t.e(a);
	} finally {
		t.f();
	}
	(window.removeEventListener(it, ae), he && (he.destroy(), (he = void 0)), yr());
}
function He(e) {
	return e.findIndex(function (t) {
		return !!t[Ue];
	});
}
function $r(e) {
	var t;
	return xe(xe({}, e), {}, ((t = {}), ne(t, Ue, !0), ne(t, w, _t), t));
}
function Pt(e) {
	var t = y.get(e.currentTarget),
		r = t.items,
		n = t.dropFromOthersDisabled;
	if (!(n && e.currentTarget !== m)) {
		if (
			((be = !1),
			(r = r.filter(function (u) {
				return u[w] !== V[w] && u[w] !== _t;
			})),
			m !== e.currentTarget)
		) {
			var a = y.get(m).items,
				i = a.filter(function (u) {
					return !u[Ue];
				});
			K(m, i, { trigger: R.DRAGGED_ENTERED_ANOTHER, id: x[w], source: N.POINTER });
		}
		var d = e.detail.indexObj.index;
		((A = e.currentTarget), r.splice(d, 0, V), K(e.currentTarget, r, { trigger: R.DRAGGED_ENTERED, id: x[w], source: N.POINTER }));
	}
}
function Ft(e) {
	if (j) {
		var t = y.get(e.currentTarget),
			r = t.items,
			n = t.dropFromOthersDisabled;
		if (!(n && e.currentTarget !== m && e.currentTarget !== A)) {
			var a = F(r),
				i = He(a);
			i !== -1 && a.splice(i, 1);
			var d = A;
			A = void 0;
			var u = e.detail,
				l = u.type,
				g = u.theOtherDz;
			if (l === Ne.OUTSIDE_OF_ANY || (l === Ne.LEFT_FOR_ANOTHER && g !== m && y.get(g).dropFromOthersDisabled)) {
				((be = !0), (A = m));
				var o = d === m ? a : F(y.get(m).items);
				(o.splice(Be, 0, V), K(m, o, { trigger: R.DRAGGED_LEFT_ALL, id: x[w], source: N.POINTER }));
			}
			K(e.currentTarget, a, { trigger: R.DRAGGED_LEFT, id: x[w], source: N.POINTER });
		}
	}
}
function Gt(e) {
	var t = y.get(e.currentTarget),
		r = t.items,
		n = t.dropFromOthersDisabled;
	if (!(n && e.currentTarget !== m)) {
		var a = F(r);
		be = !1;
		var i = e.detail.indexObj.index,
			d = He(a);
		(d !== -1 && a.splice(d, 1), a.splice(i, 0, V), K(e.currentTarget, a, { trigger: R.DRAGGED_OVER_INDEX, id: x[w], source: N.POINTER }));
	}
}
function Pe(e) {
	e.preventDefault();
	var t = e.touches ? e.touches[0] : e;
	((O = { x: t.clientX, y: t.clientY }), (b.style.transform = 'translate3d('.concat(O.x - $.x, 'px, ').concat(O.y - $.y, 'px, 0)')));
}
function ae() {
	((st = !0),
		window.removeEventListener('mousemove', Pe),
		window.removeEventListener('touchmove', Pe),
		window.removeEventListener('mouseup', ae),
		window.removeEventListener('touchend', ae),
		Ur(),
		Sr(b),
		A || (A = m));
	var e = y.get(A),
		t = e.items,
		r = e.type;
	Le(
		k.get(r),
		function (i) {
			return y.get(i).dropTargetStyle;
		},
		function (i) {
			return y.get(i).dropTargetClasses;
		}
	);
	var n = He(t);
	(n === -1 && A === m && (n = Be),
		(t = t.map(function (i) {
			return i[Ue] ? x : i;
		})));
	function a() {
		(dt(),
			ie(A, t, { trigger: be ? R.DROPPED_OUTSIDE_OF_ANY : R.DROPPED_INTO_ZONE, id: x[w], source: N.POINTER }),
			A !== m && ie(m, y.get(m).items, { trigger: R.DROPPED_INTO_ANOTHER, id: x[w], source: N.POINTER }));
		var i = Array.from(A.children).find(function (d) {
			return d.getAttribute($e);
		});
		(i && Nr(i), Hr());
	}
	y.get(A).dropAnimationDisabled ? a() : Wr(n, a);
}
function Wr(e, t) {
	var r = e > -1 ? Xe(A.children[e], !1) : Xe(A, !1),
		n = { x: r.left - parseFloat(b.style.left), y: r.top - parseFloat(b.style.top) },
		a = y.get(A),
		i = a.dropAnimationDurationMs,
		d = 'transform '.concat(i, 'ms ease');
	((b.style.transition = b.style.transition ? b.style.transition + ',' + d : d),
		(b.style.transform = 'translate3d('.concat(n.x, 'px, ').concat(n.y, 'px, 0)')),
		window.setTimeout(t, i));
}
function Br(e, t) {
	(Ce.push({ dz: e, destroy: t }),
		window.requestAnimationFrame(function () {
			(Lt(e), document.body.appendChild(e));
		}));
}
function Hr() {
	(b && b.remove && b.remove(),
		C && C.remove && C.remove(),
		(b = void 0),
		(C = void 0),
		(x = void 0),
		(We = void 0),
		(m = void 0),
		(Be = void 0),
		(V = void 0),
		(A = void 0),
		($ = void 0),
		(O = void 0),
		(j = !1),
		(st = !1),
		(dt = void 0),
		(be = !1),
		W && clearTimeout(W),
		(W = void 0),
		(me = !1),
		(ut = !1),
		Ce.length &&
			(Ce.forEach(function (e) {
				var t = e.dz,
					r = e.destroy;
				(r(), t.remove());
			}),
			(Ce = [])));
}
function Zr(e, t) {
	var r = !1,
		n = {
			items: void 0,
			type: void 0,
			flipDurationMs: 0,
			dragDisabled: !1,
			morphDisabled: !1,
			dropFromOthersDisabled: !1,
			dropTargetStyle: pt,
			dropTargetClasses: [],
			transformDraggedElement: function () {},
			centreDraggedOnCursor: !1,
			useCursorForDetection: !1,
			dropAnimationDisabled: !1,
			delayTouchStartMs: 0
		},
		a = new Map();
	function i() {
		(window.addEventListener('mousemove', l, { passive: !1 }),
			window.addEventListener('touchmove', l, { passive: !1, capture: !1 }),
			window.addEventListener('mouseup', u, { passive: !1 }),
			window.addEventListener('touchend', u, { passive: !1 }));
	}
	function d() {
		(window.removeEventListener('mousemove', l),
			window.removeEventListener('touchmove', l),
			window.removeEventListener('mouseup', u),
			window.removeEventListener('touchend', u),
			W && (clearTimeout(W), (W = void 0), (me = !1)));
	}
	function u(s) {
		if ((d(), (C = void 0), ($ = void 0), (O = void 0), s.type === 'touchend')) {
			var f = new Event('click', { bubbles: !0, cancelable: !0 });
			s.target.dispatchEvent(f);
		}
	}
	function l(s) {
		var f = !!s.touches,
			c = f ? s.touches[0] : s;
		if (f && n.delayTouchStartMs > 0 && !me) {
			((O = { x: c.clientX, y: c.clientY }),
				(Math.abs(O.x - $.x) >= Ie || Math.abs(O.y - $.y) >= Ie) && (W && (clearTimeout(W), (W = void 0)), u(s)));
			return;
		}
		(s.preventDefault(), (O = { x: c.clientX, y: c.clientY }), (Math.abs(O.x - $.x) >= Ie || Math.abs(O.y - $.y) >= Ie) && (d(), o()));
	}
	function g(s) {
		if (!(s.target !== s.currentTarget && (s.target.value !== void 0 || s.target.isContentEditable)) && !s.button && !j) {
			var f = !!s.touches,
				c = f && n.delayTouchStartMs > 0;
			(c || s.preventDefault(), s.stopPropagation());
			var p = f ? s.touches[0] : s;
			(($ = { x: p.clientX, y: p.clientY }),
				(O = xe({}, $)),
				(C = s.currentTarget),
				c &&
					((me = !1),
					(W = window.setTimeout(function () {
						C && ((me = !0), d(), o());
					}, n.delayTouchStartMs))),
				i());
		}
	}
	function o() {
		j = !0;
		var s = a.get(C);
		((Be = s), (m = C.parentElement));
		var f = m.closest('dialog') || m.closest('[popover]') || m.getRootNode(),
			c = f.body || f,
			p = n.items,
			h = n.type,
			D = n.centreDraggedOnCursor,
			T = n.useCursorForDetection,
			M = F(p);
		((x = M[s]), (We = h), (V = $r(x)), (ut = T), (b = Ir(C, D && O)), c.appendChild(b));
		function H() {
			C.parentElement ? window.requestAnimationFrame(H) : (C.setAttribute(ht, !0), c.appendChild(C), kr(), Lt(C), (V[w] = x[w]), b.focus());
		}
		(window.requestAnimationFrame(H),
			Re(
				Array.from(k.get(n.type)).filter(function (L) {
					return L === m || !y.get(L).dropFromOthersDisabled;
				}),
				function (L) {
					return y.get(L).dropTargetStyle;
				},
				function (L) {
					return y.get(L).dropTargetClasses;
				}
			),
			M.splice(s, 1, V),
			(dt = Mr(m)),
			K(m, M, { trigger: R.DRAG_STARTED, id: x[w], source: N.POINTER }),
			window.addEventListener('mousemove', Pe, { passive: !1 }),
			window.addEventListener('touchmove', Pe, { passive: !1, capture: !1 }),
			window.addEventListener('mouseup', ae, { passive: !1 }),
			window.addEventListener('touchend', ae, { passive: !1 }));
	}
	function v(s) {
		var f = s.items,
			c = f === void 0 ? void 0 : f,
			p = s.flipDurationMs,
			h = p === void 0 ? 0 : p,
			D = s.type,
			T = D === void 0 ? Lr : D,
			M = s.dragDisabled,
			H = M === void 0 ? !1 : M,
			L = s.morphDisabled,
			we = L === void 0 ? !1 : L,
			oe = s.dropFromOthersDisabled,
			se = oe === void 0 ? !1 : oe,
			de = s.dropTargetStyle,
			ue = de === void 0 ? pt : de,
			le = s.dropTargetClasses,
			Z = le === void 0 ? [] : le,
			Oe = s.transformDraggedElement,
			fe = Oe === void 0 ? function () {} : Oe,
			Ze = s.centreDraggedOnCursor,
			_e = Ze === void 0 ? !1 : Ze,
			I = s.useCursorForDetection,
			Wt = I === void 0 ? !1 : I,
			lt = s.dropAnimationDisabled,
			Bt = lt === void 0 ? !1 : lt,
			ft = s.delayTouchStart,
			ce = ft === void 0 ? !1 : ft;
		n.dropAnimationDurationMs = h;
		var je = 0;
		(ce === !0 ? (je = Gr) : typeof ce == 'number' && isFinite(ce) && ce >= 0 && (je = ce),
			(n.delayTouchStartMs = je),
			n.type && T !== n.type && yt(e, n.type),
			(n.type = T),
			(n.items = F(c)),
			(n.dragDisabled = H),
			(n.morphDisabled = we),
			(n.transformDraggedElement = fe),
			(n.centreDraggedOnCursor = _e),
			(n.useCursorForDetection = Wt),
			(n.dropAnimationDisabled = Bt),
			r &&
				j &&
				!st &&
				(!vr(ue, n.dropTargetStyle) || !mr(Z, n.dropTargetClasses)) &&
				(Le(
					[e],
					function () {
						return n.dropTargetStyle;
					},
					function () {
						return Z;
					}
				),
				Re(
					[e],
					function () {
						return ue;
					},
					function () {
						return Z;
					}
				)),
			(n.dropTargetStyle = ue),
			(n.dropTargetClasses = F(Z)));
		function Ae(U, ct) {
			return y.get(U) ? y.get(U)[ct] : n[ct];
		}
		(r &&
			j &&
			n.dropFromOthersDisabled !== se &&
			(se
				? Le(
						[e],
						function (U) {
							return Ae(U, 'dropTargetStyle');
						},
						function (U) {
							return Ae(U, 'dropTargetClasses');
						}
					)
				: Re(
						[e],
						function (U) {
							return Ae(U, 'dropTargetStyle');
						},
						function (U) {
							return Ae(U, 'dropTargetClasses');
						}
					)),
			(n.dropFromOthersDisabled = se),
			y.set(e, n),
			zr(e, T));
		for (var Ht = j ? He(n.items) : -1, Q = 0; Q < e.children.length; Q++) {
			var G = e.children[Q];
			if ((Cr(G, H), Q === Ht)) {
				(we || Rr(b, G, O.x, O.y), n.transformDraggedElement(b, x, Q), xr(G));
				continue;
			}
			(G.removeEventListener('mousedown', Ye.get(G)),
				G.removeEventListener('touchstart', Ye.get(G)),
				H || (G.addEventListener('mousedown', g), G.addEventListener('touchstart', g), Ye.set(G, g)),
				a.set(G, Q),
				r || (r = !0));
		}
	}
	return (
		v(t),
		{
			update: function (f) {
				v(f);
			},
			destroy: function () {
				function f() {
					(yt(e, y.get(e).type), y.delete(e));
				}
				j && !e.closest('['.concat(ht, ']')) ? Br(e, f) : f();
			}
		}
	);
}
var Se,
	Qe = { DND_ZONE_ACTIVE: 'dnd-zone-active', DND_ZONE_DRAG_DISABLED: 'dnd-zone-drag-disabled' },
	zt =
		((Se = {}),
		ne(Se, Qe.DND_ZONE_ACTIVE, 'Tab to one the items and press space-bar or enter to start dragging it'),
		ne(Se, Qe.DND_ZONE_DRAG_DISABLED, 'This is a disabled drag and drop list'),
		Se),
	jr = 'dnd-action-aria-alert',
	E;
function et() {
	E ||
		((E = document.createElement('div')),
		(function () {
			((E.id = jr),
				(E.style.position = 'fixed'),
				(E.style.bottom = '0'),
				(E.style.left = '0'),
				(E.style.zIndex = '-5'),
				(E.style.opacity = '0'),
				(E.style.height = '0'),
				(E.style.width = '0'),
				E.setAttribute('role', 'alert'));
		})(),
		document.body.prepend(E),
		Object.entries(zt).forEach(function (e) {
			var t = Yt(e, 2),
				r = t[0],
				n = t[1];
			return document.body.prepend(Kr(r, n));
		}));
}
function Yr() {
	return at ? null : (document.readyState === 'complete' ? et() : window.addEventListener('DOMContentLoaded', et), xe({}, Qe));
}
function Vr() {
	at ||
		!E ||
		(Object.keys(zt).forEach(function (e) {
			var t;
			return (t = document.getElementById(e)) === null || t === void 0 ? void 0 : t.remove();
		}),
		E.remove(),
		(E = void 0));
}
function Kr(e, t) {
	var r = document.createElement('div');
	return ((r.id = e), (r.innerHTML = '<p>'.concat(t, '</p>')), (r.style.display = 'none'), (r.style.position = 'fixed'), (r.style.zIndex = '-5'), r);
}
function re(e) {
	if (!at) {
		(E || et(), (E.innerHTML = ''));
		var t = document.createTextNode(e);
		(E.appendChild(t), (E.style.display = 'none'), (E.style.display = 'inline'));
	}
}
var Xr = '--any--',
	Dt = { outline: 'rgba(255, 255, 102, 0.7) solid 2px' },
	P = !1,
	tt,
	S,
	J = '',
	q,
	B,
	Y = '',
	Fe = new WeakSet(),
	Et = new WeakMap(),
	Tt = new WeakMap(),
	rt = new Map(),
	_ = new Map(),
	z = new Map(),
	Ge;
function qr(e, t) {
	(z.size === 0 && ((Ge = Yr()), window.addEventListener('keydown', kt), window.addEventListener('click', Ut)),
		z.has(t) || z.set(t, new Set()),
		z.get(t).has(e) || (z.get(t).add(e), At()));
}
function bt(e, t) {
	(S === e && De(),
		z.get(t).delete(e),
		It(),
		z.get(t).size === 0 && z.delete(t),
		z.size === 0 && (window.removeEventListener('keydown', kt), window.removeEventListener('click', Ut), (Ge = void 0), Vr()));
}
function kt(e) {
	if (P)
		switch (e.key) {
			case 'Escape': {
				De();
				break;
			}
		}
}
function Ut() {
	P && (Fe.has(document.activeElement) || De());
}
function Jr(e) {
	if (P) {
		var t = e.currentTarget;
		if (t !== S) {
			J = t.getAttribute('aria-label') || '';
			var r = _.get(S),
				n = r.items,
				a = n.find(function (v) {
					return v[w] === B;
				}),
				i = n.indexOf(a),
				d = n.splice(i, 1)[0],
				u = _.get(t),
				l = u.items,
				g = u.autoAriaDisabled;
			t.getBoundingClientRect().top < S.getBoundingClientRect().top || t.getBoundingClientRect().left < S.getBoundingClientRect().left
				? (l.push(d), g || re('Moved item '.concat(Y, ' to the end of the list ').concat(J)))
				: (l.unshift(d), g || re('Moved item '.concat(Y, ' to the beginning of the list ').concat(J)));
			var o = S;
			(ie(o, n, { trigger: R.DROPPED_INTO_ANOTHER, id: B, source: N.KEYBOARD }),
				ie(t, l, { trigger: R.DROPPED_INTO_ZONE, id: B, source: N.KEYBOARD }),
				(S = t));
		}
	}
}
function $t() {
	rt.forEach(function (e, t) {
		var r = e.update;
		return r(_.get(t));
	});
}
function De() {
	var e = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : !0;
	(_.get(S).autoAriaDisabled || re('Stopped dragging item '.concat(Y)),
		Fe.has(document.activeElement) && document.activeElement.blur(),
		e && K(S, _.get(S).items, { trigger: R.DRAG_STOPPED, id: B, source: N.KEYBOARD }),
		Le(
			z.get(tt),
			function (t) {
				return _.get(t).dropTargetStyle;
			},
			function (t) {
				return _.get(t).dropTargetClasses;
			}
		),
		(q = null),
		(B = null),
		(Y = ''),
		(tt = null),
		(S = null),
		(J = ''),
		(P = !1),
		$t());
}
function Qr(e, t) {
	var r = {
		items: void 0,
		type: void 0,
		dragDisabled: !1,
		zoneTabIndex: 0,
		zoneItemTabIndex: 0,
		dropFromOthersDisabled: !1,
		dropTargetStyle: Dt,
		dropTargetClasses: [],
		autoAriaDisabled: !1
	};
	function n(o, v, s) {
		o.length <= 1 || o.splice(s, 1, o.splice(v, 1, o[s])[0]);
	}
	function a(o) {
		switch (o.key) {
			case 'Enter':
			case ' ': {
				if ((o.target.disabled !== void 0 || o.target.href || o.target.isContentEditable) && !Fe.has(o.target)) return;
				(o.preventDefault(), o.stopPropagation(), P ? De() : i(o));
				break;
			}
			case 'ArrowDown':
			case 'ArrowRight': {
				if (!P) return;
				(o.preventDefault(), o.stopPropagation());
				var v = _.get(e),
					s = v.items,
					f = Array.from(e.children),
					c = f.indexOf(o.currentTarget);
				c < f.length - 1 &&
					(r.autoAriaDisabled ||
						re(
							'Moved item '
								.concat(Y, ' to position ')
								.concat(c + 2, ' in the list ')
								.concat(J)
						),
					n(s, c, c + 1),
					ie(e, s, { trigger: R.DROPPED_INTO_ZONE, id: B, source: N.KEYBOARD }));
				break;
			}
			case 'ArrowUp':
			case 'ArrowLeft': {
				if (!P) return;
				(o.preventDefault(), o.stopPropagation());
				var p = _.get(e),
					h = p.items,
					D = Array.from(e.children),
					T = D.indexOf(o.currentTarget);
				T > 0 &&
					(r.autoAriaDisabled || re('Moved item '.concat(Y, ' to position ').concat(T, ' in the list ').concat(J)),
					n(h, T, T - 1),
					ie(e, h, { trigger: R.DROPPED_INTO_ZONE, id: B, source: N.KEYBOARD }));
				break;
			}
		}
	}
	function i(o) {
		(u(o.currentTarget), (S = e), (tt = r.type), (P = !0));
		var v = Array.from(z.get(r.type)).filter(function (f) {
			return f === S || !_.get(f).dropFromOthersDisabled;
		});
		if (
			(Re(
				v,
				function (f) {
					return _.get(f).dropTargetStyle;
				},
				function (f) {
					return _.get(f).dropTargetClasses;
				}
			),
			!r.autoAriaDisabled)
		) {
			var s = 'Started dragging item '.concat(Y, '. Use the arrow keys to move it within its list ').concat(J);
			(v.length > 1 && (s += ', or tab to another list in order to move the item into it'), re(s));
		}
		(K(e, _.get(e).items, { trigger: R.DRAG_STARTED, id: B, source: N.KEYBOARD }), $t());
	}
	function d(o) {
		P && o.currentTarget !== q && (o.stopPropagation(), De(!1), i(o));
	}
	function u(o) {
		var v = _.get(e),
			s = v.items,
			f = Array.from(e.children),
			c = f.indexOf(o);
		((q = o), (q.tabIndex = r.zoneItemTabIndex), (B = s[c][w]), (Y = f[c].getAttribute('aria-label') || ''));
	}
	function l(o) {
		var v = o.items,
			s = v === void 0 ? [] : v,
			f = o.type,
			c = f === void 0 ? Xr : f,
			p = o.dragDisabled,
			h = p === void 0 ? !1 : p,
			D = o.zoneTabIndex,
			T = D === void 0 ? 0 : D,
			M = o.zoneItemTabIndex,
			H = M === void 0 ? 0 : M,
			L = o.dropFromOthersDisabled,
			we = L === void 0 ? !1 : L,
			oe = o.dropTargetStyle,
			se = oe === void 0 ? Dt : oe,
			de = o.dropTargetClasses,
			ue = de === void 0 ? [] : de,
			le = o.autoAriaDisabled,
			Z = le === void 0 ? !1 : le;
		((r.items = F(s)),
			(r.dragDisabled = h),
			(r.dropFromOthersDisabled = we),
			(r.zoneTabIndex = T),
			(r.zoneItemTabIndex = H),
			(r.dropTargetStyle = se),
			(r.dropTargetClasses = ue),
			(r.autoAriaDisabled = Z),
			r.type && c !== r.type && bt(e, r.type),
			(r.type = c),
			qr(e, c),
			Z || (e.setAttribute('role', 'list'), e.setAttribute('aria-describedby', h ? Ge.DND_ZONE_DRAG_DISABLED : Ge.DND_ZONE_ACTIVE)),
			_.set(e, r),
			P
				? (e.tabIndex = e === S || q.contains(e) || r.dropFromOthersDisabled || (S && r.type !== _.get(S).type) ? -1 : 0)
				: (e.tabIndex = r.zoneTabIndex),
			e.addEventListener('focus', Jr));
		for (
			var Oe = function (_e) {
					var I = e.children[_e];
					(Fe.add(I),
						(I.tabIndex = P ? -1 : r.zoneItemTabIndex),
						Z || I.setAttribute('role', 'listitem'),
						I.removeEventListener('keydown', Et.get(I)),
						I.removeEventListener('click', Tt.get(I)),
						h || (I.addEventListener('keydown', a), Et.set(I, a), I.addEventListener('click', d), Tt.set(I, d)),
						P && r.items[_e][w] === B && ((q = I), (q.tabIndex = r.zoneItemTabIndex), I.focus()));
				},
				fe = 0;
			fe < e.children.length;
			fe++
		)
			Oe(fe);
	}
	l(t);
	var g = {
		update: function (v) {
			l(v);
		},
		destroy: function () {
			(bt(e, r.type), _.delete(e), rt.delete(e));
		}
	};
	return (rt.set(e, g), g);
}
var en = [
	'items',
	'flipDurationMs',
	'type',
	'dragDisabled',
	'morphDisabled',
	'dropFromOthersDisabled',
	'zoneTabIndex',
	'zoneItemTabIndex',
	'dropTargetStyle',
	'dropTargetClasses',
	'transformDraggedElement',
	'autoAriaDisabled',
	'centreDraggedOnCursor',
	'useCursorForDetection',
	'delayTouchStart',
	'dropAnimationDisabled'
];
function rn(e, t) {
	if (tn(e)) return { update: function () {}, destroy: function () {} };
	wt(t);
	var r = Zr(e, t),
		n = Qr(e, t);
	return {
		update: function (i) {
			(wt(i), r.update(i), n.update(i));
		},
		destroy: function () {
			(r.destroy(), n.destroy());
		}
	};
}
function tn(e) {
	return !!e.closest('['.concat(sr, '="true"]'));
}
function wt(e) {
	var t = e.items;
	(e.flipDurationMs, e.type, e.dragDisabled, e.morphDisabled, e.dropFromOthersDisabled);
	var r = e.zoneTabIndex,
		n = e.zoneItemTabIndex;
	e.dropTargetStyle;
	var a = e.dropTargetClasses;
	(e.transformDraggedElement, e.autoAriaDisabled, e.centreDraggedOnCursor, e.useCursorForDetection);
	var i = e.delayTouchStart;
	e.dropAnimationDisabled;
	var d = jt(e, en);
	if ((Object.keys(d).length > 0 && console.warn('dndzone will ignore unknown options', d), !t))
		throw new Error("no 'items' key provided to dndzone");
	var u = t.find(function (o) {
		return !{}.hasOwnProperty.call(o, w);
	});
	if (u) throw new Error("missing '".concat(w, "' property for item ").concat(ge(u)));
	if (a && !Array.isArray(a)) throw new Error('dropTargetClasses should be an array but instead it is a '.concat(ee(a), ', ').concat(ge(a)));
	if (r && !Ot(r)) throw new Error('zoneTabIndex should be a number but instead it is a '.concat(ee(r), ', ').concat(ge(r)));
	if (n && !Ot(n)) throw new Error('zoneItemTabIndex should be a number but instead it is a '.concat(ee(n), ', ').concat(ge(n)));
	if (i !== void 0 && i !== !1) {
		var l = i === !0,
			g = typeof i == 'number' && isFinite(i) && i >= 0;
		if (!l && !g)
			throw new Error(
				'delayTouchStart should be a boolean (true/false) or a non-negative number but instead it is a '.concat(ee(i), ', ').concat(ge(i))
			);
	}
}
function Ot(e) {
	return (
		!isNaN(e) &&
		(function (t) {
			return (t | 0) === t;
		})(parseFloat(e))
	);
}
export { R as T, rn as d };
//# sourceMappingURL=BH6PMYIi.js.map
