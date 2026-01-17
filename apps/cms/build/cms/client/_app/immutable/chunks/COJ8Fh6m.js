const Se = (e, t) => {
		const o = new Array(e.length + t.length);
		for (let r = 0; r < e.length; r++) o[r] = e[r];
		for (let r = 0; r < t.length; r++) o[e.length + r] = t[r];
		return o;
	},
	Ie = (e, t) => ({ classGroupId: e, validator: t }),
	be = (e = new Map(), t = null, o) => ({ nextPart: e, validators: t, classGroupId: o });
const me = [],
	Pe = 'arbitrary..',
	Te = (e) => {
		const t = Oe(e),
			{ conflictingClassGroups: o, conflictingClassGroupModifiers: r } = e;
		return {
			getClassGroupId: (a) => {
				if (a.startsWith('[') && a.endsWith(']')) return Me(a);
				const u = a.split('-'),
					c = u[0] === '' && u.length > 1 ? 1 : 0;
				return ge(u, c, t);
			},
			getConflictingClassGroupIds: (a, u) => {
				if (u) {
					const c = r[a],
						f = o[a];
					return c ? (f ? Se(f, c) : c) : f || me;
				}
				return o[a] || me;
			}
		};
	},
	ge = (e, t, o) => {
		if (e.length - t === 0) return o.classGroupId;
		const i = e[t],
			d = o.nextPart.get(i);
		if (d) {
			const f = ge(e, t + 1, d);
			if (f) return f;
		}
		const a = o.validators;
		if (a === null) return;
		const u = t === 0 ? e.join('-') : e.slice(t).join('-'),
			c = a.length;
		for (let f = 0; f < c; f++) {
			const h = a[f];
			if (h.validator(u)) return h.classGroupId;
		}
	},
	Me = (e) =>
		e.slice(1, -1).indexOf(':') === -1
			? void 0
			: (() => {
					const t = e.slice(1, -1),
						o = t.indexOf(':'),
						r = t.slice(0, o);
					return r ? Pe + r : void 0;
				})(),
	Oe = (e) => {
		const { theme: t, classGroups: o } = e;
		return Ee(o, t);
	},
	Ee = (e, t) => {
		const o = be();
		for (const r in e) {
			const i = e[r];
			re(i, o, r, t);
		}
		return o;
	},
	re = (e, t, o, r) => {
		const i = e.length;
		for (let d = 0; d < i; d++) {
			const a = e[d];
			Ge(a, t, o, r);
		}
	},
	Ge = (e, t, o, r) => {
		if (typeof e == 'string') {
			_e(e, t, o);
			return;
		}
		if (typeof e == 'function') {
			Le(e, t, o, r);
			return;
		}
		Ne(e, t, o, r);
	},
	_e = (e, t, o) => {
		const r = e === '' ? t : he(t, e);
		r.classGroupId = o;
	},
	Le = (e, t, o, r) => {
		if (je(e)) {
			re(e(r), t, o, r);
			return;
		}
		(t.validators === null && (t.validators = []), t.validators.push(Ie(o, e)));
	},
	Ne = (e, t, o, r) => {
		const i = Object.entries(e),
			d = i.length;
		for (let a = 0; a < d; a++) {
			const [u, c] = i[a];
			re(c, he(t, u), o, r);
		}
	},
	he = (e, t) => {
		let o = e;
		const r = t.split('-'),
			i = r.length;
		for (let d = 0; d < i; d++) {
			const a = r[d];
			let u = o.nextPart.get(a);
			(u || ((u = be()), o.nextPart.set(a, u)), (o = u));
		}
		return o;
	},
	je = (e) => 'isThemeGetter' in e && e.isThemeGetter === !0,
	Fe = (e) => {
		if (e < 1) return { get: () => {}, set: () => {} };
		let t = 0,
			o = Object.create(null),
			r = Object.create(null);
		const i = (d, a) => {
			((o[d] = a), t++, t > e && ((t = 0), (r = o), (o = Object.create(null))));
		};
		return {
			get(d) {
				let a = o[d];
				if (a !== void 0) return a;
				if ((a = r[d]) !== void 0) return (i(d, a), a);
			},
			set(d, a) {
				d in o ? (o[d] = a) : i(d, a);
			}
		};
	};
const Ve = [],
	pe = (e, t, o, r, i) => ({ modifiers: e, hasImportantModifier: t, baseClassName: o, maybePostfixModifierPosition: r, isExternal: i }),
	We = (e) => {
		const { prefix: t, experimentalParseClassName: o } = e;
		let r = (i) => {
			const d = [];
			let a = 0,
				u = 0,
				c = 0,
				f;
			const h = i.length;
			for (let v = 0; v < h; v++) {
				const x = i[v];
				if (a === 0 && u === 0) {
					if (x === ':') {
						(d.push(i.slice(c, v)), (c = v + 1));
						continue;
					}
					if (x === '/') {
						f = v;
						continue;
					}
				}
				x === '[' ? a++ : x === ']' ? a-- : x === '(' ? u++ : x === ')' && u--;
			}
			const y = d.length === 0 ? i : i.slice(c);
			let A = y,
				I = !1;
			y.endsWith('!') ? ((A = y.slice(0, -1)), (I = !0)) : y.startsWith('!') && ((A = y.slice(1)), (I = !0));
			const P = f && f > c ? f - c : void 0;
			return pe(d, I, A, P);
		};
		if (t) {
			const i = t + ':',
				d = r;
			r = (a) => (a.startsWith(i) ? d(a.slice(i.length)) : pe(Ve, !1, a, void 0, !0));
		}
		if (o) {
			const i = r;
			r = (d) => o({ className: d, parseClassName: i });
		}
		return r;
	},
	Be = (e) => {
		const t = new Map();
		return (
			e.orderSensitiveModifiers.forEach((o, r) => {
				t.set(o, 1e6 + r);
			}),
			(o) => {
				const r = [];
				let i = [];
				for (let d = 0; d < o.length; d++) {
					const a = o[d],
						u = a[0] === '[',
						c = t.has(a);
					u || c ? (i.length > 0 && (i.sort(), r.push(...i), (i = [])), r.push(a)) : i.push(a);
				}
				return (i.length > 0 && (i.sort(), r.push(...i)), r);
			}
		);
	},
	De = (e) => ({ cache: Fe(e.cacheSize), parseClassName: We(e), sortModifiers: Be(e), ...Te(e) }),
	$e = /\s+/,
	Ue = (e, t) => {
		const { parseClassName: o, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: d } = t,
			a = [],
			u = e.trim().split($e);
		let c = '';
		for (let f = u.length - 1; f >= 0; f -= 1) {
			const h = u[f],
				{ isExternal: y, modifiers: A, hasImportantModifier: I, baseClassName: P, maybePostfixModifierPosition: v } = o(h);
			if (y) {
				c = h + (c.length > 0 ? ' ' + c : c);
				continue;
			}
			let x = !!v,
				T = r(x ? P.substring(0, v) : P);
			if (!T) {
				if (!x) {
					c = h + (c.length > 0 ? ' ' + c : c);
					continue;
				}
				if (((T = r(P)), !T)) {
					c = h + (c.length > 0 ? ' ' + c : c);
					continue;
				}
				x = !1;
			}
			const D = A.length === 0 ? '' : A.length === 1 ? A[0] : d(A).join(':'),
				V = I ? D + '!' : D,
				G = V + T;
			if (a.indexOf(G) > -1) continue;
			a.push(G);
			const _ = i(T, x);
			for (let M = 0; M < _.length; ++M) {
				const W = _[M];
				a.push(V + W);
			}
			c = h + (c.length > 0 ? ' ' + c : c);
		}
		return c;
	},
	Ye = (...e) => {
		let t = 0,
			o,
			r,
			i = '';
		for (; t < e.length; ) (o = e[t++]) && (r = we(o)) && (i && (i += ' '), (i += r));
		return i;
	},
	we = (e) => {
		if (typeof e == 'string') return e;
		let t,
			o = '';
		for (let r = 0; r < e.length; r++) e[r] && (t = we(e[r])) && (o && (o += ' '), (o += t));
		return o;
	},
	qe = (e, ...t) => {
		let o, r, i, d;
		const a = (c) => {
				const f = t.reduce((h, y) => y(h), e());
				return ((o = De(f)), (r = o.cache.get), (i = o.cache.set), (d = u), u(c));
			},
			u = (c) => {
				const f = r(c);
				if (f) return f;
				const h = Ue(c, o);
				return (i(c, h), h);
			};
		return ((d = a), (...c) => d(Ye(...c)));
	},
	Xe = [],
	b = (e) => {
		const t = (o) => o[e] || Xe;
		return ((t.isThemeGetter = !0), t);
	},
	xe = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
	ke = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
	Je = /^\d+\/\d+$/,
	He = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
	Ke = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
	Qe = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
	Ze = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
	eo = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
	N = (e) => Je.test(e),
	p = (e) => !!e && !Number.isNaN(Number(e)),
	S = (e) => !!e && Number.isInteger(Number(e)),
	ee = (e) => e.endsWith('%') && p(e.slice(0, -1)),
	C = (e) => He.test(e),
	oo = () => !0,
	ro = (e) => Ke.test(e) && !Qe.test(e),
	ye = () => !1,
	to = (e) => Ze.test(e),
	so = (e) => eo.test(e),
	no = (e) => !s(e) && !n(e),
	ao = (e) => j(e, Re, ye),
	s = (e) => xe.test(e),
	E = (e) => j(e, ze, ro),
	oe = (e) => j(e, po, p),
	ue = (e) => j(e, ve, ye),
	io = (e) => j(e, Ae, so),
	J = (e) => j(e, Ce, to),
	n = (e) => ke.test(e),
	B = (e) => F(e, ze),
	lo = (e) => F(e, uo),
	fe = (e) => F(e, ve),
	co = (e) => F(e, Re),
	mo = (e) => F(e, Ae),
	H = (e) => F(e, Ce, !0),
	j = (e, t, o) => {
		const r = xe.exec(e);
		return r ? (r[1] ? t(r[1]) : o(r[2])) : !1;
	},
	F = (e, t, o = !1) => {
		const r = ke.exec(e);
		return r ? (r[1] ? t(r[1]) : o) : !1;
	},
	ve = (e) => e === 'position' || e === 'percentage',
	Ae = (e) => e === 'image' || e === 'url',
	Re = (e) => e === 'length' || e === 'size' || e === 'bg-size',
	ze = (e) => e === 'length',
	po = (e) => e === 'number',
	uo = (e) => e === 'family-name',
	Ce = (e) => e === 'shadow',
	fo = () => {
		const e = b('color'),
			t = b('font'),
			o = b('text'),
			r = b('font-weight'),
			i = b('tracking'),
			d = b('leading'),
			a = b('breakpoint'),
			u = b('container'),
			c = b('spacing'),
			f = b('radius'),
			h = b('shadow'),
			y = b('inset-shadow'),
			A = b('text-shadow'),
			I = b('drop-shadow'),
			P = b('blur'),
			v = b('perspective'),
			x = b('aspect'),
			T = b('ease'),
			D = b('animate'),
			V = () => ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'],
			G = () => [
				'center',
				'top',
				'bottom',
				'left',
				'right',
				'top-left',
				'left-top',
				'top-right',
				'right-top',
				'bottom-right',
				'right-bottom',
				'bottom-left',
				'left-bottom'
			],
			_ = () => [...G(), n, s],
			M = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
			W = () => ['auto', 'contain', 'none'],
			m = () => [n, s, c],
			R = () => [N, 'full', 'auto', ...m()],
			te = () => [S, 'none', 'subgrid', n, s],
			se = () => ['auto', { span: ['full', S, n, s] }, S, n, s],
			$ = () => [S, 'auto', n, s],
			ne = () => ['auto', 'min', 'max', 'fr', n, s],
			K = () => ['start', 'end', 'center', 'between', 'around', 'evenly', 'stretch', 'baseline', 'center-safe', 'end-safe'],
			L = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'],
			z = () => ['auto', ...m()],
			O = () => [N, 'auto', 'full', 'dvw', 'dvh', 'lvw', 'lvh', 'svw', 'svh', 'min', 'max', 'fit', ...m()],
			l = () => [e, n, s],
			ae = () => [...G(), fe, ue, { position: [n, s] }],
			ie = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
			le = () => ['auto', 'cover', 'contain', co, ao, { size: [n, s] }],
			Q = () => [ee, B, E],
			w = () => ['', 'none', 'full', f, n, s],
			k = () => ['', p, B, E],
			U = () => ['solid', 'dashed', 'dotted', 'double'],
			ce = () => [
				'normal',
				'multiply',
				'screen',
				'overlay',
				'darken',
				'lighten',
				'color-dodge',
				'color-burn',
				'hard-light',
				'soft-light',
				'difference',
				'exclusion',
				'hue',
				'saturation',
				'color',
				'luminosity'
			],
			g = () => [p, ee, fe, ue],
			de = () => ['', 'none', P, n, s],
			Y = () => ['none', p, n, s],
			q = () => ['none', p, n, s],
			Z = () => [p, n, s],
			X = () => [N, 'full', ...m()];
		return {
			cacheSize: 500,
			theme: {
				animate: ['spin', 'ping', 'pulse', 'bounce'],
				aspect: ['video'],
				blur: [C],
				breakpoint: [C],
				color: [oo],
				container: [C],
				'drop-shadow': [C],
				ease: ['in', 'out', 'in-out'],
				font: [no],
				'font-weight': ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'],
				'inset-shadow': [C],
				leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
				perspective: ['dramatic', 'near', 'normal', 'midrange', 'distant', 'none'],
				radius: [C],
				shadow: [C],
				spacing: ['px', p],
				text: [C],
				'text-shadow': [C],
				tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
			},
			classGroups: {
				aspect: [{ aspect: ['auto', 'square', N, s, n, x] }],
				container: ['container'],
				columns: [{ columns: [p, s, n, u] }],
				'break-after': [{ 'break-after': V() }],
				'break-before': [{ 'break-before': V() }],
				'break-inside': [{ 'break-inside': ['auto', 'avoid', 'avoid-page', 'avoid-column'] }],
				'box-decoration': [{ 'box-decoration': ['slice', 'clone'] }],
				box: [{ box: ['border', 'content'] }],
				display: [
					'block',
					'inline-block',
					'inline',
					'flex',
					'inline-flex',
					'table',
					'inline-table',
					'table-caption',
					'table-cell',
					'table-column',
					'table-column-group',
					'table-footer-group',
					'table-header-group',
					'table-row-group',
					'table-row',
					'flow-root',
					'grid',
					'inline-grid',
					'contents',
					'list-item',
					'hidden'
				],
				sr: ['sr-only', 'not-sr-only'],
				float: [{ float: ['right', 'left', 'none', 'start', 'end'] }],
				clear: [{ clear: ['left', 'right', 'both', 'none', 'start', 'end'] }],
				isolation: ['isolate', 'isolation-auto'],
				'object-fit': [{ object: ['contain', 'cover', 'fill', 'none', 'scale-down'] }],
				'object-position': [{ object: _() }],
				overflow: [{ overflow: M() }],
				'overflow-x': [{ 'overflow-x': M() }],
				'overflow-y': [{ 'overflow-y': M() }],
				overscroll: [{ overscroll: W() }],
				'overscroll-x': [{ 'overscroll-x': W() }],
				'overscroll-y': [{ 'overscroll-y': W() }],
				position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
				inset: [{ inset: R() }],
				'inset-x': [{ 'inset-x': R() }],
				'inset-y': [{ 'inset-y': R() }],
				start: [{ start: R() }],
				end: [{ end: R() }],
				top: [{ top: R() }],
				right: [{ right: R() }],
				bottom: [{ bottom: R() }],
				left: [{ left: R() }],
				visibility: ['visible', 'invisible', 'collapse'],
				z: [{ z: [S, 'auto', n, s] }],
				basis: [{ basis: [N, 'full', 'auto', u, ...m()] }],
				'flex-direction': [{ flex: ['row', 'row-reverse', 'col', 'col-reverse'] }],
				'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
				flex: [{ flex: [p, N, 'auto', 'initial', 'none', s] }],
				grow: [{ grow: ['', p, n, s] }],
				shrink: [{ shrink: ['', p, n, s] }],
				order: [{ order: [S, 'first', 'last', 'none', n, s] }],
				'grid-cols': [{ 'grid-cols': te() }],
				'col-start-end': [{ col: se() }],
				'col-start': [{ 'col-start': $() }],
				'col-end': [{ 'col-end': $() }],
				'grid-rows': [{ 'grid-rows': te() }],
				'row-start-end': [{ row: se() }],
				'row-start': [{ 'row-start': $() }],
				'row-end': [{ 'row-end': $() }],
				'grid-flow': [{ 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] }],
				'auto-cols': [{ 'auto-cols': ne() }],
				'auto-rows': [{ 'auto-rows': ne() }],
				gap: [{ gap: m() }],
				'gap-x': [{ 'gap-x': m() }],
				'gap-y': [{ 'gap-y': m() }],
				'justify-content': [{ justify: [...K(), 'normal'] }],
				'justify-items': [{ 'justify-items': [...L(), 'normal'] }],
				'justify-self': [{ 'justify-self': ['auto', ...L()] }],
				'align-content': [{ content: ['normal', ...K()] }],
				'align-items': [{ items: [...L(), { baseline: ['', 'last'] }] }],
				'align-self': [{ self: ['auto', ...L(), { baseline: ['', 'last'] }] }],
				'place-content': [{ 'place-content': K() }],
				'place-items': [{ 'place-items': [...L(), 'baseline'] }],
				'place-self': [{ 'place-self': ['auto', ...L()] }],
				p: [{ p: m() }],
				px: [{ px: m() }],
				py: [{ py: m() }],
				ps: [{ ps: m() }],
				pe: [{ pe: m() }],
				pt: [{ pt: m() }],
				pr: [{ pr: m() }],
				pb: [{ pb: m() }],
				pl: [{ pl: m() }],
				m: [{ m: z() }],
				mx: [{ mx: z() }],
				my: [{ my: z() }],
				ms: [{ ms: z() }],
				me: [{ me: z() }],
				mt: [{ mt: z() }],
				mr: [{ mr: z() }],
				mb: [{ mb: z() }],
				ml: [{ ml: z() }],
				'space-x': [{ 'space-x': m() }],
				'space-x-reverse': ['space-x-reverse'],
				'space-y': [{ 'space-y': m() }],
				'space-y-reverse': ['space-y-reverse'],
				size: [{ size: O() }],
				w: [{ w: [u, 'screen', ...O()] }],
				'min-w': [{ 'min-w': [u, 'screen', 'none', ...O()] }],
				'max-w': [{ 'max-w': [u, 'screen', 'none', 'prose', { screen: [a] }, ...O()] }],
				h: [{ h: ['screen', 'lh', ...O()] }],
				'min-h': [{ 'min-h': ['screen', 'lh', 'none', ...O()] }],
				'max-h': [{ 'max-h': ['screen', 'lh', ...O()] }],
				'font-size': [{ text: ['base', o, B, E] }],
				'font-smoothing': ['antialiased', 'subpixel-antialiased'],
				'font-style': ['italic', 'not-italic'],
				'font-weight': [{ font: [r, n, oe] }],
				'font-stretch': [
					{
						'font-stretch': [
							'ultra-condensed',
							'extra-condensed',
							'condensed',
							'semi-condensed',
							'normal',
							'semi-expanded',
							'expanded',
							'extra-expanded',
							'ultra-expanded',
							ee,
							s
						]
					}
				],
				'font-family': [{ font: [lo, s, t] }],
				'fvn-normal': ['normal-nums'],
				'fvn-ordinal': ['ordinal'],
				'fvn-slashed-zero': ['slashed-zero'],
				'fvn-figure': ['lining-nums', 'oldstyle-nums'],
				'fvn-spacing': ['proportional-nums', 'tabular-nums'],
				'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
				tracking: [{ tracking: [i, n, s] }],
				'line-clamp': [{ 'line-clamp': [p, 'none', n, oe] }],
				leading: [{ leading: [d, ...m()] }],
				'list-image': [{ 'list-image': ['none', n, s] }],
				'list-style-position': [{ list: ['inside', 'outside'] }],
				'list-style-type': [{ list: ['disc', 'decimal', 'none', n, s] }],
				'text-alignment': [{ text: ['left', 'center', 'right', 'justify', 'start', 'end'] }],
				'placeholder-color': [{ placeholder: l() }],
				'text-color': [{ text: l() }],
				'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],
				'text-decoration-style': [{ decoration: [...U(), 'wavy'] }],
				'text-decoration-thickness': [{ decoration: [p, 'from-font', 'auto', n, E] }],
				'text-decoration-color': [{ decoration: l() }],
				'underline-offset': [{ 'underline-offset': [p, 'auto', n, s] }],
				'text-transform': ['uppercase', 'lowercase', 'capitalize', 'normal-case'],
				'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],
				'text-wrap': [{ text: ['wrap', 'nowrap', 'balance', 'pretty'] }],
				indent: [{ indent: m() }],
				'vertical-align': [{ align: ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super', n, s] }],
				whitespace: [{ whitespace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'] }],
				break: [{ break: ['normal', 'words', 'all', 'keep'] }],
				wrap: [{ wrap: ['break-word', 'anywhere', 'normal'] }],
				hyphens: [{ hyphens: ['none', 'manual', 'auto'] }],
				content: [{ content: ['none', n, s] }],
				'bg-attachment': [{ bg: ['fixed', 'local', 'scroll'] }],
				'bg-clip': [{ 'bg-clip': ['border', 'padding', 'content', 'text'] }],
				'bg-origin': [{ 'bg-origin': ['border', 'padding', 'content'] }],
				'bg-position': [{ bg: ae() }],
				'bg-repeat': [{ bg: ie() }],
				'bg-size': [{ bg: le() }],
				'bg-image': [
					{ bg: ['none', { linear: [{ to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] }, S, n, s], radial: ['', n, s], conic: [S, n, s] }, mo, io] }
				],
				'bg-color': [{ bg: l() }],
				'gradient-from-pos': [{ from: Q() }],
				'gradient-via-pos': [{ via: Q() }],
				'gradient-to-pos': [{ to: Q() }],
				'gradient-from': [{ from: l() }],
				'gradient-via': [{ via: l() }],
				'gradient-to': [{ to: l() }],
				rounded: [{ rounded: w() }],
				'rounded-s': [{ 'rounded-s': w() }],
				'rounded-e': [{ 'rounded-e': w() }],
				'rounded-t': [{ 'rounded-t': w() }],
				'rounded-r': [{ 'rounded-r': w() }],
				'rounded-b': [{ 'rounded-b': w() }],
				'rounded-l': [{ 'rounded-l': w() }],
				'rounded-ss': [{ 'rounded-ss': w() }],
				'rounded-se': [{ 'rounded-se': w() }],
				'rounded-ee': [{ 'rounded-ee': w() }],
				'rounded-es': [{ 'rounded-es': w() }],
				'rounded-tl': [{ 'rounded-tl': w() }],
				'rounded-tr': [{ 'rounded-tr': w() }],
				'rounded-br': [{ 'rounded-br': w() }],
				'rounded-bl': [{ 'rounded-bl': w() }],
				'border-w': [{ border: k() }],
				'border-w-x': [{ 'border-x': k() }],
				'border-w-y': [{ 'border-y': k() }],
				'border-w-s': [{ 'border-s': k() }],
				'border-w-e': [{ 'border-e': k() }],
				'border-w-t': [{ 'border-t': k() }],
				'border-w-r': [{ 'border-r': k() }],
				'border-w-b': [{ 'border-b': k() }],
				'border-w-l': [{ 'border-l': k() }],
				'divide-x': [{ 'divide-x': k() }],
				'divide-x-reverse': ['divide-x-reverse'],
				'divide-y': [{ 'divide-y': k() }],
				'divide-y-reverse': ['divide-y-reverse'],
				'border-style': [{ border: [...U(), 'hidden', 'none'] }],
				'divide-style': [{ divide: [...U(), 'hidden', 'none'] }],
				'border-color': [{ border: l() }],
				'border-color-x': [{ 'border-x': l() }],
				'border-color-y': [{ 'border-y': l() }],
				'border-color-s': [{ 'border-s': l() }],
				'border-color-e': [{ 'border-e': l() }],
				'border-color-t': [{ 'border-t': l() }],
				'border-color-r': [{ 'border-r': l() }],
				'border-color-b': [{ 'border-b': l() }],
				'border-color-l': [{ 'border-l': l() }],
				'divide-color': [{ divide: l() }],
				'outline-style': [{ outline: [...U(), 'none', 'hidden'] }],
				'outline-offset': [{ 'outline-offset': [p, n, s] }],
				'outline-w': [{ outline: ['', p, B, E] }],
				'outline-color': [{ outline: l() }],
				shadow: [{ shadow: ['', 'none', h, H, J] }],
				'shadow-color': [{ shadow: l() }],
				'inset-shadow': [{ 'inset-shadow': ['none', y, H, J] }],
				'inset-shadow-color': [{ 'inset-shadow': l() }],
				'ring-w': [{ ring: k() }],
				'ring-w-inset': ['ring-inset'],
				'ring-color': [{ ring: l() }],
				'ring-offset-w': [{ 'ring-offset': [p, E] }],
				'ring-offset-color': [{ 'ring-offset': l() }],
				'inset-ring-w': [{ 'inset-ring': k() }],
				'inset-ring-color': [{ 'inset-ring': l() }],
				'text-shadow': [{ 'text-shadow': ['none', A, H, J] }],
				'text-shadow-color': [{ 'text-shadow': l() }],
				opacity: [{ opacity: [p, n, s] }],
				'mix-blend': [{ 'mix-blend': [...ce(), 'plus-darker', 'plus-lighter'] }],
				'bg-blend': [{ 'bg-blend': ce() }],
				'mask-clip': [{ 'mask-clip': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] }, 'mask-no-clip'],
				'mask-composite': [{ mask: ['add', 'subtract', 'intersect', 'exclude'] }],
				'mask-image-linear-pos': [{ 'mask-linear': [p] }],
				'mask-image-linear-from-pos': [{ 'mask-linear-from': g() }],
				'mask-image-linear-to-pos': [{ 'mask-linear-to': g() }],
				'mask-image-linear-from-color': [{ 'mask-linear-from': l() }],
				'mask-image-linear-to-color': [{ 'mask-linear-to': l() }],
				'mask-image-t-from-pos': [{ 'mask-t-from': g() }],
				'mask-image-t-to-pos': [{ 'mask-t-to': g() }],
				'mask-image-t-from-color': [{ 'mask-t-from': l() }],
				'mask-image-t-to-color': [{ 'mask-t-to': l() }],
				'mask-image-r-from-pos': [{ 'mask-r-from': g() }],
				'mask-image-r-to-pos': [{ 'mask-r-to': g() }],
				'mask-image-r-from-color': [{ 'mask-r-from': l() }],
				'mask-image-r-to-color': [{ 'mask-r-to': l() }],
				'mask-image-b-from-pos': [{ 'mask-b-from': g() }],
				'mask-image-b-to-pos': [{ 'mask-b-to': g() }],
				'mask-image-b-from-color': [{ 'mask-b-from': l() }],
				'mask-image-b-to-color': [{ 'mask-b-to': l() }],
				'mask-image-l-from-pos': [{ 'mask-l-from': g() }],
				'mask-image-l-to-pos': [{ 'mask-l-to': g() }],
				'mask-image-l-from-color': [{ 'mask-l-from': l() }],
				'mask-image-l-to-color': [{ 'mask-l-to': l() }],
				'mask-image-x-from-pos': [{ 'mask-x-from': g() }],
				'mask-image-x-to-pos': [{ 'mask-x-to': g() }],
				'mask-image-x-from-color': [{ 'mask-x-from': l() }],
				'mask-image-x-to-color': [{ 'mask-x-to': l() }],
				'mask-image-y-from-pos': [{ 'mask-y-from': g() }],
				'mask-image-y-to-pos': [{ 'mask-y-to': g() }],
				'mask-image-y-from-color': [{ 'mask-y-from': l() }],
				'mask-image-y-to-color': [{ 'mask-y-to': l() }],
				'mask-image-radial': [{ 'mask-radial': [n, s] }],
				'mask-image-radial-from-pos': [{ 'mask-radial-from': g() }],
				'mask-image-radial-to-pos': [{ 'mask-radial-to': g() }],
				'mask-image-radial-from-color': [{ 'mask-radial-from': l() }],
				'mask-image-radial-to-color': [{ 'mask-radial-to': l() }],
				'mask-image-radial-shape': [{ 'mask-radial': ['circle', 'ellipse'] }],
				'mask-image-radial-size': [{ 'mask-radial': [{ closest: ['side', 'corner'], farthest: ['side', 'corner'] }] }],
				'mask-image-radial-pos': [{ 'mask-radial-at': G() }],
				'mask-image-conic-pos': [{ 'mask-conic': [p] }],
				'mask-image-conic-from-pos': [{ 'mask-conic-from': g() }],
				'mask-image-conic-to-pos': [{ 'mask-conic-to': g() }],
				'mask-image-conic-from-color': [{ 'mask-conic-from': l() }],
				'mask-image-conic-to-color': [{ 'mask-conic-to': l() }],
				'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
				'mask-origin': [{ 'mask-origin': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] }],
				'mask-position': [{ mask: ae() }],
				'mask-repeat': [{ mask: ie() }],
				'mask-size': [{ mask: le() }],
				'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
				'mask-image': [{ mask: ['none', n, s] }],
				filter: [{ filter: ['', 'none', n, s] }],
				blur: [{ blur: de() }],
				brightness: [{ brightness: [p, n, s] }],
				contrast: [{ contrast: [p, n, s] }],
				'drop-shadow': [{ 'drop-shadow': ['', 'none', I, H, J] }],
				'drop-shadow-color': [{ 'drop-shadow': l() }],
				grayscale: [{ grayscale: ['', p, n, s] }],
				'hue-rotate': [{ 'hue-rotate': [p, n, s] }],
				invert: [{ invert: ['', p, n, s] }],
				saturate: [{ saturate: [p, n, s] }],
				sepia: [{ sepia: ['', p, n, s] }],
				'backdrop-filter': [{ 'backdrop-filter': ['', 'none', n, s] }],
				'backdrop-blur': [{ 'backdrop-blur': de() }],
				'backdrop-brightness': [{ 'backdrop-brightness': [p, n, s] }],
				'backdrop-contrast': [{ 'backdrop-contrast': [p, n, s] }],
				'backdrop-grayscale': [{ 'backdrop-grayscale': ['', p, n, s] }],
				'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [p, n, s] }],
				'backdrop-invert': [{ 'backdrop-invert': ['', p, n, s] }],
				'backdrop-opacity': [{ 'backdrop-opacity': [p, n, s] }],
				'backdrop-saturate': [{ 'backdrop-saturate': [p, n, s] }],
				'backdrop-sepia': [{ 'backdrop-sepia': ['', p, n, s] }],
				'border-collapse': [{ border: ['collapse', 'separate'] }],
				'border-spacing': [{ 'border-spacing': m() }],
				'border-spacing-x': [{ 'border-spacing-x': m() }],
				'border-spacing-y': [{ 'border-spacing-y': m() }],
				'table-layout': [{ table: ['auto', 'fixed'] }],
				caption: [{ caption: ['top', 'bottom'] }],
				transition: [{ transition: ['', 'all', 'colors', 'opacity', 'shadow', 'transform', 'none', n, s] }],
				'transition-behavior': [{ transition: ['normal', 'discrete'] }],
				duration: [{ duration: [p, 'initial', n, s] }],
				ease: [{ ease: ['linear', 'initial', T, n, s] }],
				delay: [{ delay: [p, n, s] }],
				animate: [{ animate: ['none', D, n, s] }],
				backface: [{ backface: ['hidden', 'visible'] }],
				perspective: [{ perspective: [v, n, s] }],
				'perspective-origin': [{ 'perspective-origin': _() }],
				rotate: [{ rotate: Y() }],
				'rotate-x': [{ 'rotate-x': Y() }],
				'rotate-y': [{ 'rotate-y': Y() }],
				'rotate-z': [{ 'rotate-z': Y() }],
				scale: [{ scale: q() }],
				'scale-x': [{ 'scale-x': q() }],
				'scale-y': [{ 'scale-y': q() }],
				'scale-z': [{ 'scale-z': q() }],
				'scale-3d': ['scale-3d'],
				skew: [{ skew: Z() }],
				'skew-x': [{ 'skew-x': Z() }],
				'skew-y': [{ 'skew-y': Z() }],
				transform: [{ transform: [n, s, '', 'none', 'gpu', 'cpu'] }],
				'transform-origin': [{ origin: _() }],
				'transform-style': [{ transform: ['3d', 'flat'] }],
				translate: [{ translate: X() }],
				'translate-x': [{ 'translate-x': X() }],
				'translate-y': [{ 'translate-y': X() }],
				'translate-z': [{ 'translate-z': X() }],
				'translate-none': ['translate-none'],
				accent: [{ accent: l() }],
				appearance: [{ appearance: ['none', 'auto'] }],
				'caret-color': [{ caret: l() }],
				'color-scheme': [{ scheme: ['normal', 'dark', 'light', 'light-dark', 'only-dark', 'only-light'] }],
				cursor: [
					{
						cursor: [
							'auto',
							'default',
							'pointer',
							'wait',
							'text',
							'move',
							'help',
							'not-allowed',
							'none',
							'context-menu',
							'progress',
							'cell',
							'crosshair',
							'vertical-text',
							'alias',
							'copy',
							'no-drop',
							'grab',
							'grabbing',
							'all-scroll',
							'col-resize',
							'row-resize',
							'n-resize',
							'e-resize',
							's-resize',
							'w-resize',
							'ne-resize',
							'nw-resize',
							'se-resize',
							'sw-resize',
							'ew-resize',
							'ns-resize',
							'nesw-resize',
							'nwse-resize',
							'zoom-in',
							'zoom-out',
							n,
							s
						]
					}
				],
				'field-sizing': [{ 'field-sizing': ['fixed', 'content'] }],
				'pointer-events': [{ 'pointer-events': ['auto', 'none'] }],
				resize: [{ resize: ['none', '', 'y', 'x'] }],
				'scroll-behavior': [{ scroll: ['auto', 'smooth'] }],
				'scroll-m': [{ 'scroll-m': m() }],
				'scroll-mx': [{ 'scroll-mx': m() }],
				'scroll-my': [{ 'scroll-my': m() }],
				'scroll-ms': [{ 'scroll-ms': m() }],
				'scroll-me': [{ 'scroll-me': m() }],
				'scroll-mt': [{ 'scroll-mt': m() }],
				'scroll-mr': [{ 'scroll-mr': m() }],
				'scroll-mb': [{ 'scroll-mb': m() }],
				'scroll-ml': [{ 'scroll-ml': m() }],
				'scroll-p': [{ 'scroll-p': m() }],
				'scroll-px': [{ 'scroll-px': m() }],
				'scroll-py': [{ 'scroll-py': m() }],
				'scroll-ps': [{ 'scroll-ps': m() }],
				'scroll-pe': [{ 'scroll-pe': m() }],
				'scroll-pt': [{ 'scroll-pt': m() }],
				'scroll-pr': [{ 'scroll-pr': m() }],
				'scroll-pb': [{ 'scroll-pb': m() }],
				'scroll-pl': [{ 'scroll-pl': m() }],
				'snap-align': [{ snap: ['start', 'end', 'center', 'align-none'] }],
				'snap-stop': [{ snap: ['normal', 'always'] }],
				'snap-type': [{ snap: ['none', 'x', 'y', 'both'] }],
				'snap-strictness': [{ snap: ['mandatory', 'proximity'] }],
				touch: [{ touch: ['auto', 'none', 'manipulation'] }],
				'touch-x': [{ 'touch-pan': ['x', 'left', 'right'] }],
				'touch-y': [{ 'touch-pan': ['y', 'up', 'down'] }],
				'touch-pz': ['touch-pinch-zoom'],
				select: [{ select: ['none', 'text', 'all', 'auto'] }],
				'will-change': [{ 'will-change': ['auto', 'scroll', 'contents', 'transform', n, s] }],
				fill: [{ fill: ['none', ...l()] }],
				'stroke-w': [{ stroke: [p, B, E, oe] }],
				stroke: [{ stroke: ['none', ...l()] }],
				'forced-color-adjust': [{ 'forced-color-adjust': ['auto', 'none'] }]
			},
			conflictingClassGroups: {
				overflow: ['overflow-x', 'overflow-y'],
				overscroll: ['overscroll-x', 'overscroll-y'],
				inset: ['inset-x', 'inset-y', 'start', 'end', 'top', 'right', 'bottom', 'left'],
				'inset-x': ['right', 'left'],
				'inset-y': ['top', 'bottom'],
				flex: ['basis', 'grow', 'shrink'],
				gap: ['gap-x', 'gap-y'],
				p: ['px', 'py', 'ps', 'pe', 'pt', 'pr', 'pb', 'pl'],
				px: ['pr', 'pl'],
				py: ['pt', 'pb'],
				m: ['mx', 'my', 'ms', 'me', 'mt', 'mr', 'mb', 'ml'],
				mx: ['mr', 'ml'],
				my: ['mt', 'mb'],
				size: ['w', 'h'],
				'font-size': ['leading'],
				'fvn-normal': ['fvn-ordinal', 'fvn-slashed-zero', 'fvn-figure', 'fvn-spacing', 'fvn-fraction'],
				'fvn-ordinal': ['fvn-normal'],
				'fvn-slashed-zero': ['fvn-normal'],
				'fvn-figure': ['fvn-normal'],
				'fvn-spacing': ['fvn-normal'],
				'fvn-fraction': ['fvn-normal'],
				'line-clamp': ['display', 'overflow'],
				rounded: [
					'rounded-s',
					'rounded-e',
					'rounded-t',
					'rounded-r',
					'rounded-b',
					'rounded-l',
					'rounded-ss',
					'rounded-se',
					'rounded-ee',
					'rounded-es',
					'rounded-tl',
					'rounded-tr',
					'rounded-br',
					'rounded-bl'
				],
				'rounded-s': ['rounded-ss', 'rounded-es'],
				'rounded-e': ['rounded-se', 'rounded-ee'],
				'rounded-t': ['rounded-tl', 'rounded-tr'],
				'rounded-r': ['rounded-tr', 'rounded-br'],
				'rounded-b': ['rounded-br', 'rounded-bl'],
				'rounded-l': ['rounded-tl', 'rounded-bl'],
				'border-spacing': ['border-spacing-x', 'border-spacing-y'],
				'border-w': ['border-w-x', 'border-w-y', 'border-w-s', 'border-w-e', 'border-w-t', 'border-w-r', 'border-w-b', 'border-w-l'],
				'border-w-x': ['border-w-r', 'border-w-l'],
				'border-w-y': ['border-w-t', 'border-w-b'],
				'border-color': [
					'border-color-x',
					'border-color-y',
					'border-color-s',
					'border-color-e',
					'border-color-t',
					'border-color-r',
					'border-color-b',
					'border-color-l'
				],
				'border-color-x': ['border-color-r', 'border-color-l'],
				'border-color-y': ['border-color-t', 'border-color-b'],
				translate: ['translate-x', 'translate-y', 'translate-none'],
				'translate-none': ['translate', 'translate-x', 'translate-y', 'translate-z'],
				'scroll-m': ['scroll-mx', 'scroll-my', 'scroll-ms', 'scroll-me', 'scroll-mt', 'scroll-mr', 'scroll-mb', 'scroll-ml'],
				'scroll-mx': ['scroll-mr', 'scroll-ml'],
				'scroll-my': ['scroll-mt', 'scroll-mb'],
				'scroll-p': ['scroll-px', 'scroll-py', 'scroll-ps', 'scroll-pe', 'scroll-pt', 'scroll-pr', 'scroll-pb', 'scroll-pl'],
				'scroll-px': ['scroll-pr', 'scroll-pl'],
				'scroll-py': ['scroll-pt', 'scroll-pb'],
				touch: ['touch-x', 'touch-y', 'touch-pz'],
				'touch-x': ['touch'],
				'touch-y': ['touch'],
				'touch-pz': ['touch']
			},
			conflictingClassGroupModifiers: { 'font-size': ['leading'] },
			orderSensitiveModifiers: [
				'*',
				'**',
				'after',
				'backdrop',
				'before',
				'details-content',
				'file',
				'first-letter',
				'first-line',
				'marker',
				'placeholder',
				'selection'
			]
		};
	},
	bo = qe(fo);
export { bo as t };
//# sourceMappingURL=COJ8Fh6m.js.map
