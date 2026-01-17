import { g as hn } from './DaWZu8wl.js';
function An(U, X) {
	for (var V = 0; V < X.length; V++) {
		const x = X[V];
		if (typeof x != 'string' && !Array.isArray(x)) {
			for (const P in x)
				if (P !== 'default' && !(P in U)) {
					const p = Object.getOwnPropertyDescriptor(x, P);
					p && Object.defineProperty(U, P, p.get ? p : { enumerable: !0, get: () => x[P] });
				}
		}
	}
	return Object.freeze(Object.defineProperty(U, Symbol.toStringTag, { value: 'Module' }));
}
var Be, Dt;
function Lt() {
	if (Dt) return Be;
	Dt = 1;
	const { entries: U, setPrototypeOf: X, isFrozen: V, getPrototypeOf: x, getOwnPropertyDescriptor: P } = Object;
	let { freeze: p, seal: b, create: Ee } = Object,
		{ apply: ge, construct: he } = typeof Reflect < 'u' && Reflect;
	(p ||
		(p = function (o) {
			return o;
		}),
		b ||
			(b = function (o) {
				return o;
			}),
		ge ||
			(ge = function (o, l) {
				for (var r = arguments.length, c = new Array(r > 2 ? r - 2 : 0), O = 2; O < r; O++) c[O - 2] = arguments[O];
				return o.apply(l, c);
			}),
		he ||
			(he = function (o) {
				for (var l = arguments.length, r = new Array(l > 1 ? l - 1 : 0), c = 1; c < l; c++) r[c - 1] = arguments[c];
				return new o(...r);
			}));
	const re = A(Array.prototype.forEach),
		Ct = A(Array.prototype.lastIndexOf),
		je = A(Array.prototype.pop),
		q = A(Array.prototype.push),
		Mt = A(Array.prototype.splice),
		ae = A(String.prototype.toLowerCase),
		Ae = A(String.prototype.toString),
		Se = A(String.prototype.match),
		$ = A(String.prototype.replace),
		wt = A(String.prototype.indexOf),
		xt = A(String.prototype.trim),
		D = A(Object.prototype.hasOwnProperty),
		h = A(RegExp.prototype.test),
		K = Pt(TypeError);
	function A(s) {
		return function (o) {
			o instanceof RegExp && (o.lastIndex = 0);
			for (var l = arguments.length, r = new Array(l > 1 ? l - 1 : 0), c = 1; c < l; c++) r[c - 1] = arguments[c];
			return ge(s, o, r);
		};
	}
	function Pt(s) {
		return function () {
			for (var o = arguments.length, l = new Array(o), r = 0; r < o; r++) l[r] = arguments[r];
			return he(s, l);
		};
	}
	function a(s, o) {
		let l = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : ae;
		X && X(s, null);
		let r = o.length;
		for (; r--; ) {
			let c = o[r];
			if (typeof c == 'string') {
				const O = l(c);
				O !== c && (V(o) || (o[r] = O), (c = O));
			}
			s[c] = !0;
		}
		return s;
	}
	function vt(s) {
		for (let o = 0; o < s.length; o++) D(s, o) || (s[o] = null);
		return s;
	}
	function L(s) {
		const o = Ee(null);
		for (const [l, r] of U(s))
			D(s, l) && (Array.isArray(r) ? (o[l] = vt(r)) : r && typeof r == 'object' && r.constructor === Object ? (o[l] = L(r)) : (o[l] = r));
		return o;
	}
	function Z(s, o) {
		for (; s !== null; ) {
			const r = P(s, o);
			if (r) {
				if (r.get) return A(r.get);
				if (typeof r.value == 'function') return A(r.value);
			}
			s = x(s);
		}
		function l() {
			return null;
		}
		return l;
	}
	const Xe = p([
			'a',
			'abbr',
			'acronym',
			'address',
			'area',
			'article',
			'aside',
			'audio',
			'b',
			'bdi',
			'bdo',
			'big',
			'blink',
			'blockquote',
			'body',
			'br',
			'button',
			'canvas',
			'caption',
			'center',
			'cite',
			'code',
			'col',
			'colgroup',
			'content',
			'data',
			'datalist',
			'dd',
			'decorator',
			'del',
			'details',
			'dfn',
			'dialog',
			'dir',
			'div',
			'dl',
			'dt',
			'element',
			'em',
			'fieldset',
			'figcaption',
			'figure',
			'font',
			'footer',
			'form',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'head',
			'header',
			'hgroup',
			'hr',
			'html',
			'i',
			'img',
			'input',
			'ins',
			'kbd',
			'label',
			'legend',
			'li',
			'main',
			'map',
			'mark',
			'marquee',
			'menu',
			'menuitem',
			'meter',
			'nav',
			'nobr',
			'ol',
			'optgroup',
			'option',
			'output',
			'p',
			'picture',
			'pre',
			'progress',
			'q',
			'rp',
			'rt',
			'ruby',
			's',
			'samp',
			'search',
			'section',
			'select',
			'shadow',
			'slot',
			'small',
			'source',
			'spacer',
			'span',
			'strike',
			'strong',
			'style',
			'sub',
			'summary',
			'sup',
			'table',
			'tbody',
			'td',
			'template',
			'textarea',
			'tfoot',
			'th',
			'thead',
			'time',
			'tr',
			'track',
			'tt',
			'u',
			'ul',
			'var',
			'video',
			'wbr'
		]),
		Re = p([
			'svg',
			'a',
			'altglyph',
			'altglyphdef',
			'altglyphitem',
			'animatecolor',
			'animatemotion',
			'animatetransform',
			'circle',
			'clippath',
			'defs',
			'desc',
			'ellipse',
			'enterkeyhint',
			'exportparts',
			'filter',
			'font',
			'g',
			'glyph',
			'glyphref',
			'hkern',
			'image',
			'inputmode',
			'line',
			'lineargradient',
			'marker',
			'mask',
			'metadata',
			'mpath',
			'part',
			'path',
			'pattern',
			'polygon',
			'polyline',
			'radialgradient',
			'rect',
			'stop',
			'style',
			'switch',
			'symbol',
			'text',
			'textpath',
			'title',
			'tref',
			'tspan',
			'view',
			'vkern'
		]),
		Oe = p([
			'feBlend',
			'feColorMatrix',
			'feComponentTransfer',
			'feComposite',
			'feConvolveMatrix',
			'feDiffuseLighting',
			'feDisplacementMap',
			'feDistantLight',
			'feDropShadow',
			'feFlood',
			'feFuncA',
			'feFuncB',
			'feFuncG',
			'feFuncR',
			'feGaussianBlur',
			'feImage',
			'feMerge',
			'feMergeNode',
			'feMorphology',
			'feOffset',
			'fePointLight',
			'feSpecularLighting',
			'feSpotLight',
			'feTile',
			'feTurbulence'
		]),
		kt = p([
			'animate',
			'color-profile',
			'cursor',
			'discard',
			'font-face',
			'font-face-format',
			'font-face-name',
			'font-face-src',
			'font-face-uri',
			'foreignobject',
			'hatch',
			'hatchpath',
			'mesh',
			'meshgradient',
			'meshpatch',
			'meshrow',
			'missing-glyph',
			'script',
			'set',
			'solidcolor',
			'unknown',
			'use'
		]),
		ye = p([
			'math',
			'menclose',
			'merror',
			'mfenced',
			'mfrac',
			'mglyph',
			'mi',
			'mlabeledtr',
			'mmultiscripts',
			'mn',
			'mo',
			'mover',
			'mpadded',
			'mphantom',
			'mroot',
			'mrow',
			'ms',
			'mspace',
			'msqrt',
			'mstyle',
			'msub',
			'msup',
			'msubsup',
			'mtable',
			'mtd',
			'mtext',
			'mtr',
			'munder',
			'munderover',
			'mprescripts'
		]),
		Ut = p([
			'maction',
			'maligngroup',
			'malignmark',
			'mlongdiv',
			'mscarries',
			'mscarry',
			'msgroup',
			'mstack',
			'msline',
			'msrow',
			'semantics',
			'annotation',
			'annotation-xml',
			'mprescripts',
			'none'
		]),
		Ve = p(['#text']),
		qe = p([
			'accept',
			'action',
			'align',
			'alt',
			'autocapitalize',
			'autocomplete',
			'autopictureinpicture',
			'autoplay',
			'background',
			'bgcolor',
			'border',
			'capture',
			'cellpadding',
			'cellspacing',
			'checked',
			'cite',
			'class',
			'clear',
			'color',
			'cols',
			'colspan',
			'controls',
			'controlslist',
			'coords',
			'crossorigin',
			'datetime',
			'decoding',
			'default',
			'dir',
			'disabled',
			'disablepictureinpicture',
			'disableremoteplayback',
			'download',
			'draggable',
			'enctype',
			'enterkeyhint',
			'exportparts',
			'face',
			'for',
			'headers',
			'height',
			'hidden',
			'high',
			'href',
			'hreflang',
			'id',
			'inert',
			'inputmode',
			'integrity',
			'ismap',
			'kind',
			'label',
			'lang',
			'list',
			'loading',
			'loop',
			'low',
			'max',
			'maxlength',
			'media',
			'method',
			'min',
			'minlength',
			'multiple',
			'muted',
			'name',
			'nonce',
			'noshade',
			'novalidate',
			'nowrap',
			'open',
			'optimum',
			'part',
			'pattern',
			'placeholder',
			'playsinline',
			'popover',
			'popovertarget',
			'popovertargetaction',
			'poster',
			'preload',
			'pubdate',
			'radiogroup',
			'readonly',
			'rel',
			'required',
			'rev',
			'reversed',
			'role',
			'rows',
			'rowspan',
			'spellcheck',
			'scope',
			'selected',
			'shape',
			'size',
			'sizes',
			'slot',
			'span',
			'srclang',
			'start',
			'src',
			'srcset',
			'step',
			'style',
			'summary',
			'tabindex',
			'title',
			'translate',
			'type',
			'usemap',
			'valign',
			'value',
			'width',
			'wrap',
			'xmlns',
			'slot'
		]),
		be = p([
			'accent-height',
			'accumulate',
			'additive',
			'alignment-baseline',
			'amplitude',
			'ascent',
			'attributename',
			'attributetype',
			'azimuth',
			'basefrequency',
			'baseline-shift',
			'begin',
			'bias',
			'by',
			'class',
			'clip',
			'clippathunits',
			'clip-path',
			'clip-rule',
			'color',
			'color-interpolation',
			'color-interpolation-filters',
			'color-profile',
			'color-rendering',
			'cx',
			'cy',
			'd',
			'dx',
			'dy',
			'diffuseconstant',
			'direction',
			'display',
			'divisor',
			'dur',
			'edgemode',
			'elevation',
			'end',
			'exponent',
			'fill',
			'fill-opacity',
			'fill-rule',
			'filter',
			'filterunits',
			'flood-color',
			'flood-opacity',
			'font-family',
			'font-size',
			'font-size-adjust',
			'font-stretch',
			'font-style',
			'font-variant',
			'font-weight',
			'fx',
			'fy',
			'g1',
			'g2',
			'glyph-name',
			'glyphref',
			'gradientunits',
			'gradienttransform',
			'height',
			'href',
			'id',
			'image-rendering',
			'in',
			'in2',
			'intercept',
			'k',
			'k1',
			'k2',
			'k3',
			'k4',
			'kerning',
			'keypoints',
			'keysplines',
			'keytimes',
			'lang',
			'lengthadjust',
			'letter-spacing',
			'kernelmatrix',
			'kernelunitlength',
			'lighting-color',
			'local',
			'marker-end',
			'marker-mid',
			'marker-start',
			'markerheight',
			'markerunits',
			'markerwidth',
			'maskcontentunits',
			'maskunits',
			'max',
			'mask',
			'mask-type',
			'media',
			'method',
			'mode',
			'min',
			'name',
			'numoctaves',
			'offset',
			'operator',
			'opacity',
			'order',
			'orient',
			'orientation',
			'origin',
			'overflow',
			'paint-order',
			'path',
			'pathlength',
			'patterncontentunits',
			'patterntransform',
			'patternunits',
			'points',
			'preservealpha',
			'preserveaspectratio',
			'primitiveunits',
			'r',
			'rx',
			'ry',
			'radius',
			'refx',
			'refy',
			'repeatcount',
			'repeatdur',
			'restart',
			'result',
			'rotate',
			'scale',
			'seed',
			'shape-rendering',
			'slope',
			'specularconstant',
			'specularexponent',
			'spreadmethod',
			'startoffset',
			'stddeviation',
			'stitchtiles',
			'stop-color',
			'stop-opacity',
			'stroke-dasharray',
			'stroke-dashoffset',
			'stroke-linecap',
			'stroke-linejoin',
			'stroke-miterlimit',
			'stroke-opacity',
			'stroke',
			'stroke-width',
			'style',
			'surfacescale',
			'systemlanguage',
			'tabindex',
			'tablevalues',
			'targetx',
			'targety',
			'transform',
			'transform-origin',
			'text-anchor',
			'text-decoration',
			'text-rendering',
			'textlength',
			'type',
			'u1',
			'u2',
			'unicode',
			'values',
			'viewbox',
			'visibility',
			'version',
			'vert-adv-y',
			'vert-origin-x',
			'vert-origin-y',
			'width',
			'word-spacing',
			'wrap',
			'writing-mode',
			'xchannelselector',
			'ychannelselector',
			'x',
			'x1',
			'x2',
			'xmlns',
			'y',
			'y1',
			'y2',
			'z',
			'zoomandpan'
		]),
		$e = p([
			'accent',
			'accentunder',
			'align',
			'bevelled',
			'close',
			'columnsalign',
			'columnlines',
			'columnspan',
			'denomalign',
			'depth',
			'dir',
			'display',
			'displaystyle',
			'encoding',
			'fence',
			'frame',
			'height',
			'href',
			'id',
			'largeop',
			'length',
			'linethickness',
			'lspace',
			'lquote',
			'mathbackground',
			'mathcolor',
			'mathsize',
			'mathvariant',
			'maxsize',
			'minsize',
			'movablelimits',
			'notation',
			'numalign',
			'open',
			'rowalign',
			'rowlines',
			'rowspacing',
			'rowspan',
			'rspace',
			'rquote',
			'scriptlevel',
			'scriptminsize',
			'scriptsizemultiplier',
			'selection',
			'separator',
			'separators',
			'stretchy',
			'subscriptshift',
			'supscriptshift',
			'symmetric',
			'voffset',
			'width',
			'xmlns'
		]),
		se = p(['xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink']),
		Ft = b(/\{\{[\w\W]*|[\w\W]*\}\}/gm),
		Ht = b(/<%[\w\W]*|[\w\W]*%>/gm),
		zt = b(/\$\{[\w\W]*/gm),
		Gt = b(/^data-[\-\w.\u00B7-\uFFFF]+$/),
		Wt = b(/^aria-[\-\w]+$/),
		Ke = b(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),
		Bt = b(/^(?:\w+script|data):/i),
		Yt = b(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),
		Ze = b(/^html$/i),
		jt = b(/^[a-z][.\w]*(-[.\w]+)+$/i);
	var Je = Object.freeze({
		__proto__: null,
		ARIA_ATTR: Wt,
		ATTR_WHITESPACE: Yt,
		CUSTOM_ELEMENT: jt,
		DATA_ATTR: Gt,
		DOCTYPE_NAME: Ze,
		ERB_EXPR: Ht,
		IS_ALLOWED_URI: Ke,
		IS_SCRIPT_OR_DATA: Bt,
		MUSTACHE_EXPR: Ft,
		TMPLIT_EXPR: zt
	});
	const J = { element: 1, text: 3, progressingInstruction: 7, comment: 8, document: 9 },
		Xt = function () {
			return typeof window > 'u' ? null : window;
		},
		Vt = function (o, l) {
			if (typeof o != 'object' || typeof o.createPolicy != 'function') return null;
			let r = null;
			const c = 'data-tt-policy-suffix';
			l && l.hasAttribute(c) && (r = l.getAttribute(c));
			const O = 'dompurify' + (r ? '#' + r : '');
			try {
				return o.createPolicy(O, {
					createHTML(F) {
						return F;
					},
					createScriptURL(F) {
						return F;
					}
				});
			} catch {
				return (console.warn('TrustedTypes policy ' + O + ' could not be created.'), null);
			}
		},
		Qe = function () {
			return {
				afterSanitizeAttributes: [],
				afterSanitizeElements: [],
				afterSanitizeShadowDOM: [],
				beforeSanitizeAttributes: [],
				beforeSanitizeElements: [],
				beforeSanitizeShadowDOM: [],
				uponSanitizeAttribute: [],
				uponSanitizeElement: [],
				uponSanitizeShadowNode: []
			};
		};
	function et() {
		let s = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : Xt();
		const o = (i) => et(i);
		if (((o.version = '3.3.1'), (o.removed = []), !s || !s.document || s.document.nodeType !== J.document || !s.Element))
			return ((o.isSupported = !1), o);
		let { document: l } = s;
		const r = l,
			c = r.currentScript,
			{
				DocumentFragment: O,
				HTMLTemplateElement: F,
				Node: De,
				Element: tt,
				NodeFilter: Q,
				NamedNodeMap: $t = s.NamedNodeMap || s.MozNamedAttrMap,
				HTMLFormElement: Kt,
				DOMParser: Zt,
				trustedTypes: le
			} = s,
			ee = tt.prototype,
			Jt = Z(ee, 'cloneNode'),
			Qt = Z(ee, 'remove'),
			en = Z(ee, 'nextSibling'),
			tn = Z(ee, 'childNodes'),
			ce = Z(ee, 'parentNode');
		if (typeof F == 'function') {
			const i = l.createElement('template');
			i.content && i.content.ownerDocument && (l = i.content.ownerDocument);
		}
		let S,
			te = '';
		const { implementation: Le, createNodeIterator: nn, createDocumentFragment: on, getElementsByTagName: rn } = l,
			{ importNode: an } = r;
		let R = Qe();
		o.isSupported = typeof U == 'function' && typeof ce == 'function' && Le && Le.createHTMLDocument !== void 0;
		const {
			MUSTACHE_EXPR: Ne,
			ERB_EXPR: Ie,
			TMPLIT_EXPR: Ce,
			DATA_ATTR: sn,
			ARIA_ATTR: ln,
			IS_SCRIPT_OR_DATA: cn,
			ATTR_WHITESPACE: nt,
			CUSTOM_ELEMENT: fn
		} = Je;
		let { IS_ALLOWED_URI: ot } = Je,
			T = null;
		const it = a({}, [...Xe, ...Re, ...Oe, ...ye, ...Ve]);
		let _ = null;
		const rt = a({}, [...qe, ...be, ...$e, ...se]);
		let u = Object.seal(
				Ee(null, {
					tagNameCheck: { writable: !0, configurable: !1, enumerable: !0, value: null },
					attributeNameCheck: { writable: !0, configurable: !1, enumerable: !0, value: null },
					allowCustomizedBuiltInElements: { writable: !0, configurable: !1, enumerable: !0, value: !1 }
				})
			),
			ne = null,
			Me = null;
		const H = Object.seal(
			Ee(null, {
				tagCheck: { writable: !0, configurable: !1, enumerable: !0, value: null },
				attributeCheck: { writable: !0, configurable: !1, enumerable: !0, value: null }
			})
		);
		let at = !0,
			we = !0,
			st = !1,
			lt = !0,
			z = !1,
			fe = !0,
			v = !1,
			xe = !1,
			Pe = !1,
			G = !1,
			ue = !1,
			me = !1,
			ct = !0,
			ft = !1;
		const un = 'user-content-';
		let ve = !0,
			oe = !1,
			W = {},
			N = null;
		const ke = a({}, [
			'annotation-xml',
			'audio',
			'colgroup',
			'desc',
			'foreignobject',
			'head',
			'iframe',
			'math',
			'mi',
			'mn',
			'mo',
			'ms',
			'mtext',
			'noembed',
			'noframes',
			'noscript',
			'plaintext',
			'script',
			'style',
			'svg',
			'template',
			'thead',
			'title',
			'video',
			'xmp'
		]);
		let ut = null;
		const mt = a({}, ['audio', 'video', 'img', 'source', 'image', 'track']);
		let Ue = null;
		const pt = a({}, ['alt', 'class', 'for', 'id', 'label', 'name', 'pattern', 'placeholder', 'role', 'summary', 'title', 'value', 'style', 'xmlns']),
			pe = 'http://www.w3.org/1998/Math/MathML',
			de = 'http://www.w3.org/2000/svg',
			C = 'http://www.w3.org/1999/xhtml';
		let B = C,
			Fe = !1,
			He = null;
		const mn = a({}, [pe, de, C], Ae);
		let Te = a({}, ['mi', 'mo', 'mn', 'ms', 'mtext']),
			_e = a({}, ['annotation-xml']);
		const pn = a({}, ['title', 'style', 'font', 'a', 'script']);
		let ie = null;
		const dn = ['application/xhtml+xml', 'text/html'],
			Tn = 'text/html';
		let d = null,
			Y = null;
		const _n = l.createElement('form'),
			dt = function (e) {
				return e instanceof RegExp || e instanceof Function;
			},
			ze = function () {
				let e = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
				if (!(Y && Y === e)) {
					if (
						((!e || typeof e != 'object') && (e = {}),
						(e = L(e)),
						(ie = dn.indexOf(e.PARSER_MEDIA_TYPE) === -1 ? Tn : e.PARSER_MEDIA_TYPE),
						(d = ie === 'application/xhtml+xml' ? Ae : ae),
						(T = D(e, 'ALLOWED_TAGS') ? a({}, e.ALLOWED_TAGS, d) : it),
						(_ = D(e, 'ALLOWED_ATTR') ? a({}, e.ALLOWED_ATTR, d) : rt),
						(He = D(e, 'ALLOWED_NAMESPACES') ? a({}, e.ALLOWED_NAMESPACES, Ae) : mn),
						(Ue = D(e, 'ADD_URI_SAFE_ATTR') ? a(L(pt), e.ADD_URI_SAFE_ATTR, d) : pt),
						(ut = D(e, 'ADD_DATA_URI_TAGS') ? a(L(mt), e.ADD_DATA_URI_TAGS, d) : mt),
						(N = D(e, 'FORBID_CONTENTS') ? a({}, e.FORBID_CONTENTS, d) : ke),
						(ne = D(e, 'FORBID_TAGS') ? a({}, e.FORBID_TAGS, d) : L({})),
						(Me = D(e, 'FORBID_ATTR') ? a({}, e.FORBID_ATTR, d) : L({})),
						(W = D(e, 'USE_PROFILES') ? e.USE_PROFILES : !1),
						(at = e.ALLOW_ARIA_ATTR !== !1),
						(we = e.ALLOW_DATA_ATTR !== !1),
						(st = e.ALLOW_UNKNOWN_PROTOCOLS || !1),
						(lt = e.ALLOW_SELF_CLOSE_IN_ATTR !== !1),
						(z = e.SAFE_FOR_TEMPLATES || !1),
						(fe = e.SAFE_FOR_XML !== !1),
						(v = e.WHOLE_DOCUMENT || !1),
						(G = e.RETURN_DOM || !1),
						(ue = e.RETURN_DOM_FRAGMENT || !1),
						(me = e.RETURN_TRUSTED_TYPE || !1),
						(Pe = e.FORCE_BODY || !1),
						(ct = e.SANITIZE_DOM !== !1),
						(ft = e.SANITIZE_NAMED_PROPS || !1),
						(ve = e.KEEP_CONTENT !== !1),
						(oe = e.IN_PLACE || !1),
						(ot = e.ALLOWED_URI_REGEXP || Ke),
						(B = e.NAMESPACE || C),
						(Te = e.MATHML_TEXT_INTEGRATION_POINTS || Te),
						(_e = e.HTML_INTEGRATION_POINTS || _e),
						(u = e.CUSTOM_ELEMENT_HANDLING || {}),
						e.CUSTOM_ELEMENT_HANDLING && dt(e.CUSTOM_ELEMENT_HANDLING.tagNameCheck) && (u.tagNameCheck = e.CUSTOM_ELEMENT_HANDLING.tagNameCheck),
						e.CUSTOM_ELEMENT_HANDLING &&
							dt(e.CUSTOM_ELEMENT_HANDLING.attributeNameCheck) &&
							(u.attributeNameCheck = e.CUSTOM_ELEMENT_HANDLING.attributeNameCheck),
						e.CUSTOM_ELEMENT_HANDLING &&
							typeof e.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements == 'boolean' &&
							(u.allowCustomizedBuiltInElements = e.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements),
						z && (we = !1),
						ue && (G = !0),
						W &&
							((T = a({}, Ve)),
							(_ = []),
							W.html === !0 && (a(T, Xe), a(_, qe)),
							W.svg === !0 && (a(T, Re), a(_, be), a(_, se)),
							W.svgFilters === !0 && (a(T, Oe), a(_, be), a(_, se)),
							W.mathMl === !0 && (a(T, ye), a(_, $e), a(_, se))),
						e.ADD_TAGS && (typeof e.ADD_TAGS == 'function' ? (H.tagCheck = e.ADD_TAGS) : (T === it && (T = L(T)), a(T, e.ADD_TAGS, d))),
						e.ADD_ATTR && (typeof e.ADD_ATTR == 'function' ? (H.attributeCheck = e.ADD_ATTR) : (_ === rt && (_ = L(_)), a(_, e.ADD_ATTR, d))),
						e.ADD_URI_SAFE_ATTR && a(Ue, e.ADD_URI_SAFE_ATTR, d),
						e.FORBID_CONTENTS && (N === ke && (N = L(N)), a(N, e.FORBID_CONTENTS, d)),
						e.ADD_FORBID_CONTENTS && (N === ke && (N = L(N)), a(N, e.ADD_FORBID_CONTENTS, d)),
						ve && (T['#text'] = !0),
						v && a(T, ['html', 'head', 'body']),
						T.table && (a(T, ['tbody']), delete ne.tbody),
						e.TRUSTED_TYPES_POLICY)
					) {
						if (typeof e.TRUSTED_TYPES_POLICY.createHTML != 'function')
							throw K('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
						if (typeof e.TRUSTED_TYPES_POLICY.createScriptURL != 'function')
							throw K('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
						((S = e.TRUSTED_TYPES_POLICY), (te = S.createHTML('')));
					} else (S === void 0 && (S = Vt(le, c)), S !== null && typeof te == 'string' && (te = S.createHTML('')));
					(p && p(e), (Y = e));
				}
			},
			Tt = a({}, [...Re, ...Oe, ...kt]),
			_t = a({}, [...ye, ...Ut]),
			En = function (e) {
				let t = ce(e);
				(!t || !t.tagName) && (t = { namespaceURI: B, tagName: 'template' });
				const n = ae(e.tagName),
					f = ae(t.tagName);
				return He[e.namespaceURI]
					? e.namespaceURI === de
						? t.namespaceURI === C
							? n === 'svg'
							: t.namespaceURI === pe
								? n === 'svg' && (f === 'annotation-xml' || Te[f])
								: !!Tt[n]
						: e.namespaceURI === pe
							? t.namespaceURI === C
								? n === 'math'
								: t.namespaceURI === de
									? n === 'math' && _e[f]
									: !!_t[n]
							: e.namespaceURI === C
								? (t.namespaceURI === de && !_e[f]) || (t.namespaceURI === pe && !Te[f])
									? !1
									: !_t[n] && (pn[n] || !Tt[n])
								: !!(ie === 'application/xhtml+xml' && He[e.namespaceURI])
					: !1;
			},
			I = function (e) {
				q(o.removed, { element: e });
				try {
					ce(e).removeChild(e);
				} catch {
					Qt(e);
				}
			},
			k = function (e, t) {
				try {
					q(o.removed, { attribute: t.getAttributeNode(e), from: t });
				} catch {
					q(o.removed, { attribute: null, from: t });
				}
				if ((t.removeAttribute(e), e === 'is'))
					if (G || ue)
						try {
							I(t);
						} catch {}
					else
						try {
							t.setAttribute(e, '');
						} catch {}
			},
			Et = function (e) {
				let t = null,
					n = null;
				if (Pe) e = '<remove></remove>' + e;
				else {
					const m = Se(e, /^[\r\n\t ]+/);
					n = m && m[0];
				}
				ie === 'application/xhtml+xml' && B === C && (e = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + e + '</body></html>');
				const f = S ? S.createHTML(e) : e;
				if (B === C)
					try {
						t = new Zt().parseFromString(f, ie);
					} catch {}
				if (!t || !t.documentElement) {
					t = Le.createDocument(B, 'template', null);
					try {
						t.documentElement.innerHTML = Fe ? te : f;
					} catch {}
				}
				const g = t.body || t.documentElement;
				return (
					e && n && g.insertBefore(l.createTextNode(n), g.childNodes[0] || null),
					B === C ? rn.call(t, v ? 'html' : 'body')[0] : v ? t.documentElement : g
				);
			},
			gt = function (e) {
				return nn.call(
					e.ownerDocument || e,
					e,
					Q.SHOW_ELEMENT | Q.SHOW_COMMENT | Q.SHOW_TEXT | Q.SHOW_PROCESSING_INSTRUCTION | Q.SHOW_CDATA_SECTION,
					null
				);
			},
			Ge = function (e) {
				return (
					e instanceof Kt &&
					(typeof e.nodeName != 'string' ||
						typeof e.textContent != 'string' ||
						typeof e.removeChild != 'function' ||
						!(e.attributes instanceof $t) ||
						typeof e.removeAttribute != 'function' ||
						typeof e.setAttribute != 'function' ||
						typeof e.namespaceURI != 'string' ||
						typeof e.insertBefore != 'function' ||
						typeof e.hasChildNodes != 'function')
				);
			},
			ht = function (e) {
				return typeof De == 'function' && e instanceof De;
			};
		function M(i, e, t) {
			re(i, (n) => {
				n.call(o, e, t, Y);
			});
		}
		const At = function (e) {
				let t = null;
				if ((M(R.beforeSanitizeElements, e, null), Ge(e))) return (I(e), !0);
				const n = d(e.nodeName);
				if (
					(M(R.uponSanitizeElement, e, { tagName: n, allowedTags: T }),
					(fe && e.hasChildNodes() && !ht(e.firstElementChild) && h(/<[/\w!]/g, e.innerHTML) && h(/<[/\w!]/g, e.textContent)) ||
						e.nodeType === J.progressingInstruction ||
						(fe && e.nodeType === J.comment && h(/<[/\w]/g, e.data)))
				)
					return (I(e), !0);
				if (!(H.tagCheck instanceof Function && H.tagCheck(n)) && (!T[n] || ne[n])) {
					if (
						!ne[n] &&
						Rt(n) &&
						((u.tagNameCheck instanceof RegExp && h(u.tagNameCheck, n)) || (u.tagNameCheck instanceof Function && u.tagNameCheck(n)))
					)
						return !1;
					if (ve && !N[n]) {
						const f = ce(e) || e.parentNode,
							g = tn(e) || e.childNodes;
						if (g && f) {
							const m = g.length;
							for (let y = m - 1; y >= 0; --y) {
								const w = Jt(g[y], !0);
								((w.__removalCount = (e.__removalCount || 0) + 1), f.insertBefore(w, en(e)));
							}
						}
					}
					return (I(e), !0);
				}
				return (e instanceof tt && !En(e)) ||
					((n === 'noscript' || n === 'noembed' || n === 'noframes') && h(/<\/no(script|embed|frames)/i, e.innerHTML))
					? (I(e), !0)
					: (z &&
							e.nodeType === J.text &&
							((t = e.textContent),
							re([Ne, Ie, Ce], (f) => {
								t = $(t, f, ' ');
							}),
							e.textContent !== t && (q(o.removed, { element: e.cloneNode() }), (e.textContent = t))),
						M(R.afterSanitizeElements, e, null),
						!1);
			},
			St = function (e, t, n) {
				if (ct && (t === 'id' || t === 'name') && (n in l || n in _n)) return !1;
				if (!(we && !Me[t] && h(sn, t))) {
					if (!(at && h(ln, t))) {
						if (!(H.attributeCheck instanceof Function && H.attributeCheck(t, e))) {
							if (!_[t] || Me[t]) {
								if (
									!(
										(Rt(e) &&
											((u.tagNameCheck instanceof RegExp && h(u.tagNameCheck, e)) || (u.tagNameCheck instanceof Function && u.tagNameCheck(e))) &&
											((u.attributeNameCheck instanceof RegExp && h(u.attributeNameCheck, t)) ||
												(u.attributeNameCheck instanceof Function && u.attributeNameCheck(t, e)))) ||
										(t === 'is' &&
											u.allowCustomizedBuiltInElements &&
											((u.tagNameCheck instanceof RegExp && h(u.tagNameCheck, n)) || (u.tagNameCheck instanceof Function && u.tagNameCheck(n))))
									)
								)
									return !1;
							} else if (!Ue[t]) {
								if (!h(ot, $(n, nt, ''))) {
									if (!((t === 'src' || t === 'xlink:href' || t === 'href') && e !== 'script' && wt(n, 'data:') === 0 && ut[e])) {
										if (!(st && !h(cn, $(n, nt, '')))) {
											if (n) return !1;
										}
									}
								}
							}
						}
					}
				}
				return !0;
			},
			Rt = function (e) {
				return e !== 'annotation-xml' && Se(e, fn);
			},
			Ot = function (e) {
				M(R.beforeSanitizeAttributes, e, null);
				const { attributes: t } = e;
				if (!t || Ge(e)) return;
				const n = { attrName: '', attrValue: '', keepAttr: !0, allowedAttributes: _, forceKeepAttr: void 0 };
				let f = t.length;
				for (; f--; ) {
					const g = t[f],
						{ name: m, namespaceURI: y, value: w } = g,
						j = d(m),
						We = w;
					let E = m === 'value' ? We : xt(We);
					if (
						((n.attrName = j),
						(n.attrValue = E),
						(n.keepAttr = !0),
						(n.forceKeepAttr = void 0),
						M(R.uponSanitizeAttribute, e, n),
						(E = n.attrValue),
						ft && (j === 'id' || j === 'name') && (k(m, e), (E = un + E)),
						fe && h(/((--!?|])>)|<\/(style|title|textarea)/i, E))
					) {
						k(m, e);
						continue;
					}
					if (j === 'attributename' && Se(E, 'href')) {
						k(m, e);
						continue;
					}
					if (n.forceKeepAttr) continue;
					if (!n.keepAttr) {
						k(m, e);
						continue;
					}
					if (!lt && h(/\/>/i, E)) {
						k(m, e);
						continue;
					}
					z &&
						re([Ne, Ie, Ce], (bt) => {
							E = $(E, bt, ' ');
						});
					const yt = d(e.nodeName);
					if (!St(yt, j, E)) {
						k(m, e);
						continue;
					}
					if (S && typeof le == 'object' && typeof le.getAttributeType == 'function' && !y)
						switch (le.getAttributeType(yt, j)) {
							case 'TrustedHTML': {
								E = S.createHTML(E);
								break;
							}
							case 'TrustedScriptURL': {
								E = S.createScriptURL(E);
								break;
							}
						}
					if (E !== We)
						try {
							(y ? e.setAttributeNS(y, m, E) : e.setAttribute(m, E), Ge(e) ? I(e) : je(o.removed));
						} catch {
							k(m, e);
						}
				}
				M(R.afterSanitizeAttributes, e, null);
			},
			gn = function i(e) {
				let t = null;
				const n = gt(e);
				for (M(R.beforeSanitizeShadowDOM, e, null); (t = n.nextNode()); )
					(M(R.uponSanitizeShadowNode, t, null), At(t), Ot(t), t.content instanceof O && i(t.content));
				M(R.afterSanitizeShadowDOM, e, null);
			};
		return (
			(o.sanitize = function (i) {
				let e = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {},
					t = null,
					n = null,
					f = null,
					g = null;
				if (((Fe = !i), Fe && (i = '<!-->'), typeof i != 'string' && !ht(i)))
					if (typeof i.toString == 'function') {
						if (((i = i.toString()), typeof i != 'string')) throw K('dirty is not a string, aborting');
					} else throw K('toString is not a function');
				if (!o.isSupported) return i;
				if ((xe || ze(e), (o.removed = []), typeof i == 'string' && (oe = !1), oe)) {
					if (i.nodeName) {
						const w = d(i.nodeName);
						if (!T[w] || ne[w]) throw K('root node is forbidden and cannot be sanitized in-place');
					}
				} else if (i instanceof De)
					((t = Et('<!---->')),
						(n = t.ownerDocument.importNode(i, !0)),
						(n.nodeType === J.element && n.nodeName === 'BODY') || n.nodeName === 'HTML' ? (t = n) : t.appendChild(n));
				else {
					if (!G && !z && !v && i.indexOf('<') === -1) return S && me ? S.createHTML(i) : i;
					if (((t = Et(i)), !t)) return G ? null : me ? te : '';
				}
				t && Pe && I(t.firstChild);
				const m = gt(oe ? i : t);
				for (; (f = m.nextNode()); ) (At(f), Ot(f), f.content instanceof O && gn(f.content));
				if (oe) return i;
				if (G) {
					if (ue) for (g = on.call(t.ownerDocument); t.firstChild; ) g.appendChild(t.firstChild);
					else g = t;
					return ((_.shadowroot || _.shadowrootmode) && (g = an.call(r, g, !0)), g);
				}
				let y = v ? t.outerHTML : t.innerHTML;
				return (
					v &&
						T['!doctype'] &&
						t.ownerDocument &&
						t.ownerDocument.doctype &&
						t.ownerDocument.doctype.name &&
						h(Ze, t.ownerDocument.doctype.name) &&
						(y =
							'<!DOCTYPE ' +
							t.ownerDocument.doctype.name +
							`>
` +
							y),
					z &&
						re([Ne, Ie, Ce], (w) => {
							y = $(y, w, ' ');
						}),
					S && me ? S.createHTML(y) : y
				);
			}),
			(o.setConfig = function () {
				let i = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
				(ze(i), (xe = !0));
			}),
			(o.clearConfig = function () {
				((Y = null), (xe = !1));
			}),
			(o.isValidAttribute = function (i, e, t) {
				Y || ze({});
				const n = d(i),
					f = d(e);
				return St(n, f, t);
			}),
			(o.addHook = function (i, e) {
				typeof e == 'function' && q(R[i], e);
			}),
			(o.removeHook = function (i, e) {
				if (e !== void 0) {
					const t = Ct(R[i], e);
					return t === -1 ? void 0 : Mt(R[i], t, 1)[0];
				}
				return je(R[i]);
			}),
			(o.removeHooks = function (i) {
				R[i] = [];
			}),
			(o.removeAllHooks = function () {
				R = Qe();
			}),
			o
		);
	}
	var qt = et();
	return ((Be = qt), Be);
}
var Ye, Nt;
function Sn() {
	return (Nt || ((Nt = 1), (Ye = self.DOMPurify || (self.DOMPurify = Lt().default || Lt()))), Ye);
}
var It = Sn();
const Rn = hn(It),
	yn = An({ __proto__: null, default: Rn }, [It]);
export { yn as b };
//# sourceMappingURL=ClfUjtKL.js.map
