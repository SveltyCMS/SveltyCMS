import { x as Bi, g as _t, u as Rt } from './DrlZFkx8.js';
function Hi() {
	const s = Bi({
			file: null,
			saveEditedImage: !1,
			editHistory: [],
			currentHistoryIndex: -1,
			stage: null,
			layer: null,
			imageNode: null,
			imageGroup: null,
			activeState: '',
			stateHistory: [],
			toolbarControls: null,
			preToolSnapshot: null,
			actions: {},
			error: null
		}),
		t = Rt(() => s.currentHistoryIndex >= 0),
		e = Rt(() => s.currentHistoryIndex < s.editHistory.length - 1),
		i = Rt(() => !!s.file && !!s.imageNode),
		n = Rt(() => s.stateHistory.length > 1 && s.currentHistoryIndex > 0),
		r = Rt(() => s.currentHistoryIndex < s.stateHistory.length - 1);
	function a(R) {
		s.file = R;
	}
	function o(R) {
		s.saveEditedImage = R;
	}
	function h(R) {
		s.stage = R;
	}
	function l(R) {
		s.layer = R;
	}
	function c(R) {
		s.imageNode = R;
	}
	function f(R) {
		s.imageGroup = R;
	}
	function d(R) {
		const w = s.activeState;
		(R !== '' && R !== w ? (s.preToolSnapshot = N(!0)) : R === '' && (s.preToolSnapshot = null), (s.activeState = R));
	}
	function p() {
		const R = s.activeState;
		R && (s.preToolSnapshot, S(R), d(''), g(null));
	}
	function g(R) {
		s.toolbarControls = R;
	}
	function _(R) {
		s.actions = { ...s.actions, ...R };
	}
	function b(R) {
		s.error = R;
	}
	function y() {
		if (!s.layer) return;
		([
			'.cropTool',
			'.transformer',
			'.blurTool',
			'.cropOverlayGroup',
			'[name="cropTool"]',
			'[name="cropHighlight"]',
			'[name="cropOverlay"]',
			'.rotationGrid',
			'.gridLayer',
			'.blurRegion',
			'.mosaicOverlay',
			'[name="watermark"]',
			'[name="watermarkTransformer"]'
		].forEach((w) => {
			s.layer.find(w).forEach((T) => {
				try {
					T.destroy();
				} catch (W) {
					console.warn('Error destroying node:', W);
				}
			});
		}),
			s.layer.find('Transformer').forEach((w) => {
				if (w.name() !== 'annotationTransformer')
					try {
						w.destroy();
					} catch (T) {
						console.warn('Error destroying transformer:', T);
					}
			}),
			s.layer.find('Image').forEach((w) => {
				if (w !== s.imageNode)
					try {
						w.destroy();
					} catch (T) {
						console.warn('Error destroying overlay image:', T);
					}
			}),
			s.layer.find('Group').forEach((w) => {
				if (w.name() === 'cropOverlayGroup' || w.name().includes('temp'))
					try {
						w.destroy();
					} catch (T) {
						console.warn('Error destroying temporary group:', T);
					}
			}),
			s.layer.clearCache(),
			s.layer.batchDraw());
	}
	function S(R) {
		if (s.layer) {
			switch (R) {
				case 'crop':
					(s.layer.find('.cropTool').forEach((w) => {
						try {
							w.destroy();
						} catch (T) {
							console.warn('Error destroying crop tool:', T);
						}
					}),
						s.layer.find('.cropOverlayGroup').forEach((w) => {
							try {
								w.destroy();
							} catch (T) {
								console.warn('Error destroying crop overlay group:', T);
							}
						}),
						s.layer.find('[name="cropHighlight"]').forEach((w) => {
							try {
								w.destroy();
							} catch (T) {
								console.warn('Error destroying crop highlight:', T);
							}
						}));
					break;
				case 'blur':
					(s.layer.find('.blurRegion').forEach((w) => {
						try {
							w.destroy();
						} catch (T) {
							console.warn('Error destroying blur region:', T);
						}
					}),
						s.layer.find('.mosaicOverlay').forEach((w) => {
							try {
								w.destroy();
							} catch (T) {
								console.warn('Error destroying mosaic overlay:', T);
							}
						}),
						s.layer.find('Image').forEach((w) => {
							if (w !== s.imageNode)
								try {
									w.destroy();
								} catch (T) {
									console.warn('Error destroying blur overlay image:', T);
								}
						}));
					break;
				case 'watermark':
					(s.layer.find('[name="watermark"]').forEach((w) => {
						try {
							w.destroy();
						} catch (T) {
							console.warn('Error destroying watermark:', T);
						}
					}),
						s.layer.find('[name="watermarkTransformer"]').forEach((w) => {
							try {
								w.destroy();
							} catch (T) {
								console.warn('Error destroying watermark transformer:', T);
							}
						}));
					break;
			}
			(s.layer.find('Transformer').forEach((w) => {
				if (w.name() !== 'annotationTransformer')
					try {
						w.destroy();
					} catch (T) {
						console.warn('Error destroying transformer:', T);
					}
			}),
				s.layer.clearCache(),
				s.layer.batchDraw());
		}
	}
	function C() {
		s.stage && G();
	}
	function v() {
		if (!s.stage) return;
		(s.stage
			.find((w) => {
				const T = w.className,
					W = w.name() || '';
				return (
					T === 'Transformer' ||
					W.includes('toolbar') ||
					W.includes('Overlay') ||
					W.includes('Grid') ||
					W.includes('cropTool') ||
					W.includes('cropCut')
				);
			})
			.forEach((w) => {
				w.visible(!1);
			}),
			s.layer && s.layer.batchDraw(),
			s.stage.batchDraw());
	}
	function G() {
		if (!s.stage) return;
		s.layer && s.layer.batchDraw();
		const R = { stage: s.stage.toJSON(), activeState: s.activeState, timestamp: Date.now() };
		O(JSON.stringify(R));
	}
	function k(R) {
		((s.editHistory = s.editHistory.slice(0, s.currentHistoryIndex + 1)), s.editHistory.push(R), (s.currentHistoryIndex = s.editHistory.length - 1));
	}
	function O(R) {
		(s.currentHistoryIndex < s.stateHistory.length - 1 && (s.stateHistory = s.stateHistory.slice(0, s.currentHistoryIndex + 1)),
			s.stateHistory.push(R),
			(s.currentHistoryIndex = s.stateHistory.length - 1));
	}
	function M() {
		s.currentHistoryIndex >= 0 && (s.editHistory[s.currentHistoryIndex].undo(), s.currentHistoryIndex--);
	}
	function L() {
		s.currentHistoryIndex < s.editHistory.length - 1 && (s.currentHistoryIndex++, s.editHistory[s.currentHistoryIndex].redo());
	}
	function N(R = !1) {
		if ((!R && !_t(n)) || (R && s.currentHistoryIndex < 0)) return null;
		let w = s.currentHistoryIndex;
		return (R || (w--, (s.currentHistoryIndex = w)), w < 0 || w >= s.stateHistory.length ? null : s.stateHistory[w]);
	}
	function B() {
		return _t(r) ? (s.currentHistoryIndex++, s.stateHistory[s.currentHistoryIndex]) : null;
	}
	function I() {
		((s.editHistory = []), (s.currentHistoryIndex = -1), (s.stateHistory = []));
	}
	function H() {
		((s.file = null),
			(s.saveEditedImage = !1),
			(s.editHistory = []),
			(s.currentHistoryIndex = -1),
			(s.stage = null),
			(s.layer = null),
			(s.imageNode = null),
			(s.imageGroup = null),
			(s.activeState = ''),
			(s.stateHistory = []));
	}
	return {
		get state() {
			return s;
		},
		get canUndo() {
			return _t(t);
		},
		get canRedo() {
			return _t(e);
		},
		get hasActiveImage() {
			return _t(i);
		},
		get canUndoState() {
			return _t(n);
		},
		get canRedoState() {
			return _t(r);
		},
		reset: H,
		setStage: h,
		setLayer: l,
		setImageNode: c,
		setImageGroup: f,
		setFile: a,
		setActiveState: d,
		setToolbarControls: g,
		setError: b,
		setActions: _,
		cleanupTempNodes: y,
		hideAllUI: v,
		takeSnapshot: G,
		addEditAction: k,
		saveToolState: C,
		cleanupToolSpecific: S,
		cancelActiveTool: p,
		undoState: (R) => N(R),
		redoState: B,
		clearHistory: I,
		setSaveEditedImage: o,
		handleUndo: () => M(),
		handleRedo: () => L()
	};
}
const fr = Hi(),
	Wi = Math.PI / 180;
function zi() {
	return typeof window < 'u' && ({}.toString.call(window) === '[object Window]' || {}.toString.call(window) === '[object global]');
}
const St = typeof global < 'u' ? global : typeof window < 'u' ? window : typeof WorkerGlobalScope < 'u' ? self : {},
	A = {
		_global: St,
		version: '10.2.0',
		isBrowser: zi(),
		isUnminified: /param/.test(function (s) {}.toString()),
		dblClickWindow: 400,
		getAngle(s) {
			return A.angleDeg ? s * Wi : s;
		},
		enableTrace: !1,
		pointerEventsEnabled: !0,
		autoDrawEnabled: !0,
		hitOnDragEnabled: !1,
		capturePointerEventsEnabled: !1,
		_mouseListenClick: !1,
		_touchListenClick: !1,
		_pointerListenClick: !1,
		_mouseInDblClickWindow: !1,
		_touchInDblClickWindow: !1,
		_pointerInDblClickWindow: !1,
		_mouseDblClickPointerId: null,
		_touchDblClickPointerId: null,
		_pointerDblClickPointerId: null,
		_renderBackend: 'web',
		legacyTextRendering: !1,
		pixelRatio: (typeof window < 'u' && window.devicePixelRatio) || 1,
		dragDistance: 3,
		angleDeg: !0,
		showWarnings: !0,
		dragButtons: [0, 1],
		isDragging() {
			return A.DD.isDragging;
		},
		isTransforming() {
			var s, t;
			return (t = (s = A.Transformer) === null || s === void 0 ? void 0 : s.isTransforming()) !== null && t !== void 0 ? t : !1;
		},
		isDragReady() {
			return !!A.DD.node;
		},
		releaseCanvasOnDestroy: !0,
		document: St.document,
		_injectGlobal(s) {
			(typeof St.Konva < 'u' &&
				console.error('Several Konva instances detected. It is not recommended to use multiple Konva instances in the same environment.'),
				(St.Konva = s));
		}
	},
	K = (s) => {
		A[s.prototype.getClassName()] = s;
	};
A._injectGlobal(A);
const Yi = `Konva.js unsupported environment.

Looks like you are trying to use Konva.js in Node.js environment. because "document" object is undefined.

To use Konva.js in Node.js environment, you need to use the "canvas-backend" or "skia-backend" module.

bash: npm install canvas
js: import "konva/canvas-backend";

or

bash: npm install skia-canvas
js: import "konva/skia-backend";
`,
	Ie = () => {
		if (typeof document > 'u') throw new Error(Yi);
	};
class tt {
	constructor(t = [1, 0, 0, 1, 0, 0]) {
		((this.dirty = !1), (this.m = (t && t.slice()) || [1, 0, 0, 1, 0, 0]));
	}
	reset() {
		((this.m[0] = 1), (this.m[1] = 0), (this.m[2] = 0), (this.m[3] = 1), (this.m[4] = 0), (this.m[5] = 0));
	}
	copy() {
		return new tt(this.m);
	}
	copyInto(t) {
		((t.m[0] = this.m[0]), (t.m[1] = this.m[1]), (t.m[2] = this.m[2]), (t.m[3] = this.m[3]), (t.m[4] = this.m[4]), (t.m[5] = this.m[5]));
	}
	point(t) {
		const e = this.m;
		return { x: e[0] * t.x + e[2] * t.y + e[4], y: e[1] * t.x + e[3] * t.y + e[5] };
	}
	translate(t, e) {
		return ((this.m[4] += this.m[0] * t + this.m[2] * e), (this.m[5] += this.m[1] * t + this.m[3] * e), this);
	}
	scale(t, e) {
		return ((this.m[0] *= t), (this.m[1] *= t), (this.m[2] *= e), (this.m[3] *= e), this);
	}
	rotate(t) {
		const e = Math.cos(t),
			i = Math.sin(t),
			n = this.m[0] * e + this.m[2] * i,
			r = this.m[1] * e + this.m[3] * i,
			a = this.m[0] * -i + this.m[2] * e,
			o = this.m[1] * -i + this.m[3] * e;
		return ((this.m[0] = n), (this.m[1] = r), (this.m[2] = a), (this.m[3] = o), this);
	}
	getTranslation() {
		return { x: this.m[4], y: this.m[5] };
	}
	skew(t, e) {
		const i = this.m[0] + this.m[2] * e,
			n = this.m[1] + this.m[3] * e,
			r = this.m[2] + this.m[0] * t,
			a = this.m[3] + this.m[1] * t;
		return ((this.m[0] = i), (this.m[1] = n), (this.m[2] = r), (this.m[3] = a), this);
	}
	multiply(t) {
		const e = this.m[0] * t.m[0] + this.m[2] * t.m[1],
			i = this.m[1] * t.m[0] + this.m[3] * t.m[1],
			n = this.m[0] * t.m[2] + this.m[2] * t.m[3],
			r = this.m[1] * t.m[2] + this.m[3] * t.m[3],
			a = this.m[0] * t.m[4] + this.m[2] * t.m[5] + this.m[4],
			o = this.m[1] * t.m[4] + this.m[3] * t.m[5] + this.m[5];
		return ((this.m[0] = e), (this.m[1] = i), (this.m[2] = n), (this.m[3] = r), (this.m[4] = a), (this.m[5] = o), this);
	}
	invert() {
		const t = 1 / (this.m[0] * this.m[3] - this.m[1] * this.m[2]),
			e = this.m[3] * t,
			i = -this.m[1] * t,
			n = -this.m[2] * t,
			r = this.m[0] * t,
			a = t * (this.m[2] * this.m[5] - this.m[3] * this.m[4]),
			o = t * (this.m[1] * this.m[4] - this.m[0] * this.m[5]);
		return ((this.m[0] = e), (this.m[1] = i), (this.m[2] = n), (this.m[3] = r), (this.m[4] = a), (this.m[5] = o), this);
	}
	getMatrix() {
		return this.m;
	}
	decompose() {
		const t = this.m[0],
			e = this.m[1],
			i = this.m[2],
			n = this.m[3],
			r = this.m[4],
			a = this.m[5],
			o = t * n - e * i,
			h = { x: r, y: a, rotation: 0, scaleX: 0, scaleY: 0, skewX: 0, skewY: 0 };
		if (t != 0 || e != 0) {
			const l = Math.sqrt(t * t + e * e);
			((h.rotation = e > 0 ? Math.acos(t / l) : -Math.acos(t / l)),
				(h.scaleX = l),
				(h.scaleY = o / l),
				(h.skewX = (t * i + e * n) / o),
				(h.skewY = 0));
		} else if (i != 0 || n != 0) {
			const l = Math.sqrt(i * i + n * n);
			((h.rotation = Math.PI / 2 - (n > 0 ? Math.acos(-i / l) : -Math.acos(i / l))),
				(h.scaleX = o / l),
				(h.scaleY = l),
				(h.skewX = 0),
				(h.skewY = (t * i + e * n) / o));
		}
		return ((h.rotation = m._getRotation(h.rotation)), h);
	}
}
const Xi = '[object Array]',
	Ui = '[object Number]',
	Vi = '[object String]',
	qi = '[object Boolean]',
	ji = Math.PI / 180,
	Ki = 180 / Math.PI,
	Mt = '#',
	$i = '',
	Qi = '0',
	Ji = 'Konva warning: ',
	De = 'Konva error: ',
	Zi = 'rgb(',
	ce = {
		aliceblue: [240, 248, 255],
		antiquewhite: [250, 235, 215],
		aqua: [0, 255, 255],
		aquamarine: [127, 255, 212],
		azure: [240, 255, 255],
		beige: [245, 245, 220],
		bisque: [255, 228, 196],
		black: [0, 0, 0],
		blanchedalmond: [255, 235, 205],
		blue: [0, 0, 255],
		blueviolet: [138, 43, 226],
		brown: [165, 42, 42],
		burlywood: [222, 184, 135],
		cadetblue: [95, 158, 160],
		chartreuse: [127, 255, 0],
		chocolate: [210, 105, 30],
		coral: [255, 127, 80],
		cornflowerblue: [100, 149, 237],
		cornsilk: [255, 248, 220],
		crimson: [220, 20, 60],
		cyan: [0, 255, 255],
		darkblue: [0, 0, 139],
		darkcyan: [0, 139, 139],
		darkgoldenrod: [184, 132, 11],
		darkgray: [169, 169, 169],
		darkgreen: [0, 100, 0],
		darkgrey: [169, 169, 169],
		darkkhaki: [189, 183, 107],
		darkmagenta: [139, 0, 139],
		darkolivegreen: [85, 107, 47],
		darkorange: [255, 140, 0],
		darkorchid: [153, 50, 204],
		darkred: [139, 0, 0],
		darksalmon: [233, 150, 122],
		darkseagreen: [143, 188, 143],
		darkslateblue: [72, 61, 139],
		darkslategray: [47, 79, 79],
		darkslategrey: [47, 79, 79],
		darkturquoise: [0, 206, 209],
		darkviolet: [148, 0, 211],
		deeppink: [255, 20, 147],
		deepskyblue: [0, 191, 255],
		dimgray: [105, 105, 105],
		dimgrey: [105, 105, 105],
		dodgerblue: [30, 144, 255],
		firebrick: [178, 34, 34],
		floralwhite: [255, 255, 240],
		forestgreen: [34, 139, 34],
		fuchsia: [255, 0, 255],
		gainsboro: [220, 220, 220],
		ghostwhite: [248, 248, 255],
		gold: [255, 215, 0],
		goldenrod: [218, 165, 32],
		gray: [128, 128, 128],
		green: [0, 128, 0],
		greenyellow: [173, 255, 47],
		grey: [128, 128, 128],
		honeydew: [240, 255, 240],
		hotpink: [255, 105, 180],
		indianred: [205, 92, 92],
		indigo: [75, 0, 130],
		ivory: [255, 255, 240],
		khaki: [240, 230, 140],
		lavender: [230, 230, 250],
		lavenderblush: [255, 240, 245],
		lawngreen: [124, 252, 0],
		lemonchiffon: [255, 250, 205],
		lightblue: [173, 216, 230],
		lightcoral: [240, 128, 128],
		lightcyan: [224, 255, 255],
		lightgoldenrodyellow: [250, 250, 210],
		lightgray: [211, 211, 211],
		lightgreen: [144, 238, 144],
		lightgrey: [211, 211, 211],
		lightpink: [255, 182, 193],
		lightsalmon: [255, 160, 122],
		lightseagreen: [32, 178, 170],
		lightskyblue: [135, 206, 250],
		lightslategray: [119, 136, 153],
		lightslategrey: [119, 136, 153],
		lightsteelblue: [176, 196, 222],
		lightyellow: [255, 255, 224],
		lime: [0, 255, 0],
		limegreen: [50, 205, 50],
		linen: [250, 240, 230],
		magenta: [255, 0, 255],
		maroon: [128, 0, 0],
		mediumaquamarine: [102, 205, 170],
		mediumblue: [0, 0, 205],
		mediumorchid: [186, 85, 211],
		mediumpurple: [147, 112, 219],
		mediumseagreen: [60, 179, 113],
		mediumslateblue: [123, 104, 238],
		mediumspringgreen: [0, 250, 154],
		mediumturquoise: [72, 209, 204],
		mediumvioletred: [199, 21, 133],
		midnightblue: [25, 25, 112],
		mintcream: [245, 255, 250],
		mistyrose: [255, 228, 225],
		moccasin: [255, 228, 181],
		navajowhite: [255, 222, 173],
		navy: [0, 0, 128],
		oldlace: [253, 245, 230],
		olive: [128, 128, 0],
		olivedrab: [107, 142, 35],
		orange: [255, 165, 0],
		orangered: [255, 69, 0],
		orchid: [218, 112, 214],
		palegoldenrod: [238, 232, 170],
		palegreen: [152, 251, 152],
		paleturquoise: [175, 238, 238],
		palevioletred: [219, 112, 147],
		papayawhip: [255, 239, 213],
		peachpuff: [255, 218, 185],
		peru: [205, 133, 63],
		pink: [255, 192, 203],
		plum: [221, 160, 203],
		powderblue: [176, 224, 230],
		purple: [128, 0, 128],
		rebeccapurple: [102, 51, 153],
		red: [255, 0, 0],
		rosybrown: [188, 143, 143],
		royalblue: [65, 105, 225],
		saddlebrown: [139, 69, 19],
		salmon: [250, 128, 114],
		sandybrown: [244, 164, 96],
		seagreen: [46, 139, 87],
		seashell: [255, 245, 238],
		sienna: [160, 82, 45],
		silver: [192, 192, 192],
		skyblue: [135, 206, 235],
		slateblue: [106, 90, 205],
		slategray: [119, 128, 144],
		slategrey: [119, 128, 144],
		snow: [255, 255, 250],
		springgreen: [0, 255, 127],
		steelblue: [70, 130, 180],
		tan: [210, 180, 140],
		teal: [0, 128, 128],
		thistle: [216, 191, 216],
		transparent: [255, 255, 255, 0],
		tomato: [255, 99, 71],
		turquoise: [64, 224, 208],
		violet: [238, 130, 238],
		wheat: [245, 222, 179],
		white: [255, 255, 255],
		whitesmoke: [245, 245, 245],
		yellow: [255, 255, 0],
		yellowgreen: [154, 205, 5]
	},
	tn = /rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/;
let jt = [],
	Gt = null;
const en =
		(typeof requestAnimationFrame < 'u' && requestAnimationFrame) ||
		function (s) {
			setTimeout(s, 16);
		},
	m = {
		_isElement(s) {
			return !!(s && s.nodeType == 1);
		},
		_isFunction(s) {
			return !!(s && s.constructor && s.call && s.apply);
		},
		_isPlainObject(s) {
			return !!s && s.constructor === Object;
		},
		_isArray(s) {
			return Object.prototype.toString.call(s) === Xi;
		},
		_isNumber(s) {
			return Object.prototype.toString.call(s) === Ui && !isNaN(s) && isFinite(s);
		},
		_isString(s) {
			return Object.prototype.toString.call(s) === Vi;
		},
		_isBoolean(s) {
			return Object.prototype.toString.call(s) === qi;
		},
		isObject(s) {
			return s instanceof Object;
		},
		isValidSelector(s) {
			if (typeof s != 'string') return !1;
			const t = s[0];
			return t === '#' || t === '.' || t === t.toUpperCase();
		},
		_sign(s) {
			return s === 0 || s > 0 ? 1 : -1;
		},
		requestAnimFrame(s) {
			(jt.push(s),
				jt.length === 1 &&
					en(function () {
						const t = jt;
						((jt = []),
							t.forEach(function (e) {
								e();
							}));
					}));
		},
		createCanvasElement() {
			Ie();
			const s = document.createElement('canvas');
			try {
				s.style = s.style || {};
			} catch {}
			return s;
		},
		createImageElement() {
			return (Ie(), document.createElement('img'));
		},
		_isInDocument(s) {
			for (; (s = s.parentNode); ) if (s == document) return !0;
			return !1;
		},
		_urlToImage(s, t) {
			const e = m.createImageElement();
			((e.onload = function () {
				t(e);
			}),
				(e.src = s));
		},
		_rgbToHex(s, t, e) {
			return ((1 << 24) + (s << 16) + (t << 8) + e).toString(16).slice(1);
		},
		_hexToRgb(s) {
			s = s.replace(Mt, $i);
			const t = parseInt(s, 16);
			return { r: (t >> 16) & 255, g: (t >> 8) & 255, b: t & 255 };
		},
		getRandomColor() {
			let s = ((Math.random() * 16777215) << 0).toString(16);
			for (; s.length < 6; ) s = Qi + s;
			return Mt + s;
		},
		isCanvasFarblingActive() {
			if (Gt !== null) return Gt;
			if (typeof document > 'u') return ((Gt = !1), !1);
			const s = this.createCanvasElement();
			((s.width = 10), (s.height = 10));
			const t = s.getContext('2d', { willReadFrequently: !0 });
			(t.clearRect(0, 0, 10, 10), (t.fillStyle = '#282828'), t.fillRect(0, 0, 10, 10));
			const e = t.getImageData(0, 0, 10, 10).data;
			let i = !1;
			for (let n = 0; n < 100; n++)
				if (e[n * 4] !== 40 || e[n * 4 + 1] !== 40 || e[n * 4 + 2] !== 40 || e[n * 4 + 3] !== 255) {
					i = !0;
					break;
				}
			return ((Gt = i), this.releaseCanvas(s), Gt);
		},
		getHitColor() {
			const s = this.getRandomColor();
			return this.isCanvasFarblingActive() ? this.getSnappedHexColor(s) : s;
		},
		getHitColorKey(s, t, e) {
			return (
				this.isCanvasFarblingActive() && ((s = Math.round(s / 5) * 5), (t = Math.round(t / 5) * 5), (e = Math.round(e / 5) * 5)),
				Mt + this._rgbToHex(s, t, e)
			);
		},
		getSnappedHexColor(s) {
			const t = this._hexToRgb(s);
			return Mt + this._rgbToHex(Math.round(t.r / 5) * 5, Math.round(t.g / 5) * 5, Math.round(t.b / 5) * 5);
		},
		getRGB(s) {
			let t;
			return s in ce
				? ((t = ce[s]), { r: t[0], g: t[1], b: t[2] })
				: s[0] === Mt
					? this._hexToRgb(s.substring(1))
					: s.substr(0, 4) === Zi
						? ((t = tn.exec(s.replace(/ /g, ''))), { r: parseInt(t[1], 10), g: parseInt(t[2], 10), b: parseInt(t[3], 10) })
						: { r: 0, g: 0, b: 0 };
		},
		colorToRGBA(s) {
			return (
				(s = s || 'black'),
				m._namedColorToRBA(s) ||
					m._hex3ColorToRGBA(s) ||
					m._hex4ColorToRGBA(s) ||
					m._hex6ColorToRGBA(s) ||
					m._hex8ColorToRGBA(s) ||
					m._rgbColorToRGBA(s) ||
					m._rgbaColorToRGBA(s) ||
					m._hslColorToRGBA(s)
			);
		},
		_namedColorToRBA(s) {
			const t = ce[s.toLowerCase()];
			return t ? { r: t[0], g: t[1], b: t[2], a: 1 } : null;
		},
		_rgbColorToRGBA(s) {
			if (s.indexOf('rgb(') === 0) {
				s = s.match(/rgb\(([^)]+)\)/)[1];
				const t = s.split(/ *, */).map(Number);
				return { r: t[0], g: t[1], b: t[2], a: 1 };
			}
		},
		_rgbaColorToRGBA(s) {
			if (s.indexOf('rgba(') === 0) {
				s = s.match(/rgba\(([^)]+)\)/)[1];
				const t = s.split(/ *, */).map((e, i) => (e.slice(-1) === '%' ? (i === 3 ? parseInt(e) / 100 : (parseInt(e) / 100) * 255) : Number(e)));
				return { r: t[0], g: t[1], b: t[2], a: t[3] };
			}
		},
		_hex8ColorToRGBA(s) {
			if (s[0] === '#' && s.length === 9)
				return {
					r: parseInt(s.slice(1, 3), 16),
					g: parseInt(s.slice(3, 5), 16),
					b: parseInt(s.slice(5, 7), 16),
					a: parseInt(s.slice(7, 9), 16) / 255
				};
		},
		_hex6ColorToRGBA(s) {
			if (s[0] === '#' && s.length === 7)
				return { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16), a: 1 };
		},
		_hex4ColorToRGBA(s) {
			if (s[0] === '#' && s.length === 5)
				return { r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16), a: parseInt(s[4] + s[4], 16) / 255 };
		},
		_hex3ColorToRGBA(s) {
			if (s[0] === '#' && s.length === 4) return { r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16), a: 1 };
		},
		_hslColorToRGBA(s) {
			if (/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.test(s)) {
				const [t, ...e] = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(s),
					i = Number(e[0]) / 360,
					n = Number(e[1]) / 100,
					r = Number(e[2]) / 100;
				let a, o, h;
				if (n === 0) return ((h = r * 255), { r: Math.round(h), g: Math.round(h), b: Math.round(h), a: 1 });
				r < 0.5 ? (a = r * (1 + n)) : (a = r + n - r * n);
				const l = 2 * r - a,
					c = [0, 0, 0];
				for (let f = 0; f < 3; f++)
					((o = i + (1 / 3) * -(f - 1)),
						o < 0 && o++,
						o > 1 && o--,
						6 * o < 1 ? (h = l + (a - l) * 6 * o) : 2 * o < 1 ? (h = a) : 3 * o < 2 ? (h = l + (a - l) * (2 / 3 - o) * 6) : (h = l),
						(c[f] = h * 255));
				return { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), a: 1 };
			}
		},
		haveIntersection(s, t) {
			return !(t.x > s.x + s.width || t.x + t.width < s.x || t.y > s.y + s.height || t.y + t.height < s.y);
		},
		cloneObject(s) {
			const t = {};
			for (const e in s)
				this._isPlainObject(s[e]) ? (t[e] = this.cloneObject(s[e])) : this._isArray(s[e]) ? (t[e] = this.cloneArray(s[e])) : (t[e] = s[e]);
			return t;
		},
		cloneArray(s) {
			return s.slice(0);
		},
		degToRad(s) {
			return s * ji;
		},
		radToDeg(s) {
			return s * Ki;
		},
		_degToRad(s) {
			return (m.warn('Util._degToRad is removed. Please use public Util.degToRad instead.'), m.degToRad(s));
		},
		_radToDeg(s) {
			return (m.warn('Util._radToDeg is removed. Please use public Util.radToDeg instead.'), m.radToDeg(s));
		},
		_getRotation(s) {
			return A.angleDeg ? m.radToDeg(s) : s;
		},
		_capitalize(s) {
			return s.charAt(0).toUpperCase() + s.slice(1);
		},
		throw(s) {
			throw new Error(De + s);
		},
		error(s) {
			console.error(De + s);
		},
		warn(s) {
			A.showWarnings && console.warn(Ji + s);
		},
		each(s, t) {
			for (const e in s) t(e, s[e]);
		},
		_inRange(s, t, e) {
			return t <= s && s < e;
		},
		_getProjectionToSegment(s, t, e, i, n, r) {
			let a, o, h;
			const l = (s - e) * (s - e) + (t - i) * (t - i);
			if (l == 0) ((a = s), (o = t), (h = (n - e) * (n - e) + (r - i) * (r - i)));
			else {
				const c = ((n - s) * (e - s) + (r - t) * (i - t)) / l;
				c < 0
					? ((a = s), (o = t), (h = (s - n) * (s - n) + (t - r) * (t - r)))
					: c > 1
						? ((a = e), (o = i), (h = (e - n) * (e - n) + (i - r) * (i - r)))
						: ((a = s + c * (e - s)), (o = t + c * (i - t)), (h = (a - n) * (a - n) + (o - r) * (o - r)));
			}
			return [a, o, h];
		},
		_getProjectionToLine(s, t, e) {
			const i = m.cloneObject(s);
			let n = Number.MAX_VALUE;
			return (
				t.forEach(function (r, a) {
					if (!e && a === t.length - 1) return;
					const o = t[(a + 1) % t.length],
						h = m._getProjectionToSegment(r.x, r.y, o.x, o.y, s.x, s.y),
						l = h[0],
						c = h[1],
						f = h[2];
					f < n && ((i.x = l), (i.y = c), (n = f));
				}),
				i
			);
		},
		_prepareArrayForTween(s, t, e) {
			const i = [],
				n = [];
			if (s.length > t.length) {
				const a = t;
				((t = s), (s = a));
			}
			for (let a = 0; a < s.length; a += 2) i.push({ x: s[a], y: s[a + 1] });
			for (let a = 0; a < t.length; a += 2) n.push({ x: t[a], y: t[a + 1] });
			const r = [];
			return (
				n.forEach(function (a) {
					const o = m._getProjectionToLine(a, i, e);
					(r.push(o.x), r.push(o.y));
				}),
				r
			);
		},
		_prepareToStringify(s) {
			let t;
			s.visitedByCircularReferenceRemoval = !0;
			for (const e in s)
				if (s.hasOwnProperty(e) && s[e] && typeof s[e] == 'object') {
					if (((t = Object.getOwnPropertyDescriptor(s, e)), s[e].visitedByCircularReferenceRemoval || m._isElement(s[e])))
						if (t.configurable) delete s[e];
						else return null;
					else if (m._prepareToStringify(s[e]) === null)
						if (t.configurable) delete s[e];
						else return null;
				}
			return (delete s.visitedByCircularReferenceRemoval, s);
		},
		_assign(s, t) {
			for (const e in t) s[e] = t[e];
			return s;
		},
		_getFirstPointerId(s) {
			return s.touches ? s.changedTouches[0].identifier : s.pointerId || 999;
		},
		releaseCanvas(...s) {
			A.releaseCanvasOnDestroy &&
				s.forEach((t) => {
					((t.width = 0), (t.height = 0));
				});
		},
		drawRoundedRectPath(s, t, e, i) {
			let n = t < 0 ? t : 0,
				r = e < 0 ? e : 0;
			((t = Math.abs(t)), (e = Math.abs(e)));
			let a = 0,
				o = 0,
				h = 0,
				l = 0;
			(typeof i == 'number'
				? (a = o = h = l = Math.min(i, t / 2, e / 2))
				: ((a = Math.min(i[0] || 0, t / 2, e / 2)),
					(o = Math.min(i[1] || 0, t / 2, e / 2)),
					(l = Math.min(i[2] || 0, t / 2, e / 2)),
					(h = Math.min(i[3] || 0, t / 2, e / 2))),
				s.moveTo(n + a, r),
				s.lineTo(n + t - o, r),
				s.arc(n + t - o, r + o, o, (Math.PI * 3) / 2, 0, !1),
				s.lineTo(n + t, r + e - l),
				s.arc(n + t - l, r + e - l, l, 0, Math.PI / 2, !1),
				s.lineTo(n + h, r + e),
				s.arc(n + h, r + e - h, h, Math.PI / 2, Math.PI, !1),
				s.lineTo(n, r + a),
				s.arc(n + a, r + a, a, Math.PI, (Math.PI * 3) / 2, !1));
		},
		drawRoundedPolygonPath(s, t, e, i, n) {
			i = Math.abs(i);
			for (let r = 0; r < e; r++) {
				const a = t[(r - 1 + e) % e],
					o = t[r],
					h = t[(r + 1) % e],
					l = { x: o.x - a.x, y: o.y - a.y },
					c = { x: h.x - o.x, y: h.y - o.y },
					f = Math.hypot(l.x, l.y),
					d = Math.hypot(c.x, c.y);
				let p;
				(typeof n == 'number' ? (p = n) : (p = r < n.length ? n[r] : 0), (p = i * Math.cos(Math.PI / e) * Math.min(1, (p / i) * 2)));
				const _ = { x: l.x / f, y: l.y / f },
					b = { x: c.x / d, y: c.y / d },
					y = { x: o.x - _.x * p, y: o.y - _.y * p },
					S = { x: o.x + b.x * p, y: o.y + b.y * p };
				(r === 0 ? s.moveTo(y.x, y.y) : s.lineTo(y.x, y.y), s.arcTo(o.x, o.y, S.x, S.y, p));
			}
		}
	};
function nn(s) {
	const t = [],
		e = s.length,
		i = m;
	for (let n = 0; n < e; n++) {
		let r = s[n];
		(i._isNumber(r) ? (r = Math.round(r * 1e3) / 1e3) : i._isString(r) || (r = r + ''), t.push(r));
	}
	return t;
}
const Ne = ',',
	sn = '(',
	rn = ')',
	an = '([',
	on = '])',
	hn = ';',
	ln = '()',
	cn = '=',
	Fe = [
		'arc',
		'arcTo',
		'beginPath',
		'bezierCurveTo',
		'clearRect',
		'clip',
		'closePath',
		'createLinearGradient',
		'createPattern',
		'createRadialGradient',
		'drawImage',
		'ellipse',
		'fill',
		'fillText',
		'getImageData',
		'createImageData',
		'lineTo',
		'moveTo',
		'putImageData',
		'quadraticCurveTo',
		'rect',
		'roundRect',
		'restore',
		'rotate',
		'save',
		'scale',
		'setLineDash',
		'setTransform',
		'stroke',
		'strokeText',
		'transform',
		'translate'
	],
	dn = [
		'fillStyle',
		'strokeStyle',
		'shadowColor',
		'shadowBlur',
		'shadowOffsetX',
		'shadowOffsetY',
		'letterSpacing',
		'lineCap',
		'lineDashOffset',
		'lineJoin',
		'lineWidth',
		'miterLimit',
		'direction',
		'font',
		'textAlign',
		'textBaseline',
		'globalAlpha',
		'globalCompositeOperation',
		'imageSmoothingEnabled',
		'filter'
	],
	fn = 100;
let Kt = null;
function Be() {
	if (Kt !== null) return Kt;
	try {
		const t = m.createCanvasElement().getContext('2d');
		return t ? !!t && 'filter' in t : ((Kt = !1), !1);
	} catch {
		return ((Kt = !1), !1);
	}
}
class oe {
	constructor(t) {
		((this.canvas = t), A.enableTrace && ((this.traceArr = []), this._enableTrace()));
	}
	fillShape(t) {
		t.fillEnabled() && this._fill(t);
	}
	_fill(t) {}
	strokeShape(t) {
		t.hasStroke() && this._stroke(t);
	}
	_stroke(t) {}
	fillStrokeShape(t) {
		t.attrs.fillAfterStrokeEnabled ? (this.strokeShape(t), this.fillShape(t)) : (this.fillShape(t), this.strokeShape(t));
	}
	getTrace(t, e) {
		let i = this.traceArr,
			n = i.length,
			r = '',
			a,
			o,
			h,
			l;
		for (a = 0; a < n; a++)
			((o = i[a]),
				(h = o.method),
				h
					? ((l = o.args),
						(r += h),
						t
							? (r += ln)
							: m._isArray(l[0])
								? (r += an + l.join(Ne) + on)
								: (e && (l = l.map((c) => (typeof c == 'number' ? Math.floor(c) : c))), (r += sn + l.join(Ne) + rn)))
					: ((r += o.property), t || (r += cn + o.val)),
				(r += hn));
		return r;
	}
	clearTrace() {
		this.traceArr = [];
	}
	_trace(t) {
		let e = this.traceArr,
			i;
		(e.push(t), (i = e.length), i >= fn && e.shift());
	}
	reset() {
		const t = this.getCanvas().getPixelRatio();
		this.setTransform(1 * t, 0, 0, 1 * t, 0, 0);
	}
	getCanvas() {
		return this.canvas;
	}
	clear(t) {
		const e = this.getCanvas();
		t
			? this.clearRect(t.x || 0, t.y || 0, t.width || 0, t.height || 0)
			: this.clearRect(0, 0, e.getWidth() / e.pixelRatio, e.getHeight() / e.pixelRatio);
	}
	_applyLineCap(t) {
		const e = t.attrs.lineCap;
		e && this.setAttr('lineCap', e);
	}
	_applyOpacity(t) {
		const e = t.getAbsoluteOpacity();
		e !== 1 && this.setAttr('globalAlpha', e);
	}
	_applyLineJoin(t) {
		const e = t.attrs.lineJoin;
		e && this.setAttr('lineJoin', e);
	}
	_applyMiterLimit(t) {
		const e = t.attrs.miterLimit;
		e != null && this.setAttr('miterLimit', e);
	}
	setAttr(t, e) {
		this._context[t] = e;
	}
	arc(t, e, i, n, r, a) {
		this._context.arc(t, e, i, n, r, a);
	}
	arcTo(t, e, i, n, r) {
		this._context.arcTo(t, e, i, n, r);
	}
	beginPath() {
		this._context.beginPath();
	}
	bezierCurveTo(t, e, i, n, r, a) {
		this._context.bezierCurveTo(t, e, i, n, r, a);
	}
	clearRect(t, e, i, n) {
		this._context.clearRect(t, e, i, n);
	}
	clip(...t) {
		this._context.clip.apply(this._context, t);
	}
	closePath() {
		this._context.closePath();
	}
	createImageData(t, e) {
		const i = arguments;
		if (i.length === 2) return this._context.createImageData(t, e);
		if (i.length === 1) return this._context.createImageData(t);
	}
	createLinearGradient(t, e, i, n) {
		return this._context.createLinearGradient(t, e, i, n);
	}
	createPattern(t, e) {
		return this._context.createPattern(t, e);
	}
	createRadialGradient(t, e, i, n, r, a) {
		return this._context.createRadialGradient(t, e, i, n, r, a);
	}
	drawImage(t, e, i, n, r, a, o, h, l) {
		const c = arguments,
			f = this._context;
		c.length === 3 ? f.drawImage(t, e, i) : c.length === 5 ? f.drawImage(t, e, i, n, r) : c.length === 9 && f.drawImage(t, e, i, n, r, a, o, h, l);
	}
	ellipse(t, e, i, n, r, a, o, h) {
		this._context.ellipse(t, e, i, n, r, a, o, h);
	}
	isPointInPath(t, e, i, n) {
		return i ? this._context.isPointInPath(i, t, e, n) : this._context.isPointInPath(t, e, n);
	}
	fill(...t) {
		this._context.fill.apply(this._context, t);
	}
	fillRect(t, e, i, n) {
		this._context.fillRect(t, e, i, n);
	}
	strokeRect(t, e, i, n) {
		this._context.strokeRect(t, e, i, n);
	}
	fillText(t, e, i, n) {
		n ? this._context.fillText(t, e, i, n) : this._context.fillText(t, e, i);
	}
	measureText(t) {
		return this._context.measureText(t);
	}
	getImageData(t, e, i, n) {
		return this._context.getImageData(t, e, i, n);
	}
	lineTo(t, e) {
		this._context.lineTo(t, e);
	}
	moveTo(t, e) {
		this._context.moveTo(t, e);
	}
	rect(t, e, i, n) {
		this._context.rect(t, e, i, n);
	}
	roundRect(t, e, i, n, r) {
		this._context.roundRect(t, e, i, n, r);
	}
	putImageData(t, e, i) {
		this._context.putImageData(t, e, i);
	}
	quadraticCurveTo(t, e, i, n) {
		this._context.quadraticCurveTo(t, e, i, n);
	}
	restore() {
		this._context.restore();
	}
	rotate(t) {
		this._context.rotate(t);
	}
	save() {
		this._context.save();
	}
	scale(t, e) {
		this._context.scale(t, e);
	}
	setLineDash(t) {
		this._context.setLineDash
			? this._context.setLineDash(t)
			: 'mozDash' in this._context
				? (this._context.mozDash = t)
				: 'webkitLineDash' in this._context && (this._context.webkitLineDash = t);
	}
	getLineDash() {
		return this._context.getLineDash();
	}
	setTransform(t, e, i, n, r, a) {
		this._context.setTransform(t, e, i, n, r, a);
	}
	stroke(t) {
		t ? this._context.stroke(t) : this._context.stroke();
	}
	strokeText(t, e, i, n) {
		this._context.strokeText(t, e, i, n);
	}
	transform(t, e, i, n, r, a) {
		this._context.transform(t, e, i, n, r, a);
	}
	translate(t, e) {
		this._context.translate(t, e);
	}
	_enableTrace() {
		let t = this,
			e = Fe.length,
			i = this.setAttr,
			n,
			r;
		const a = function (o) {
			let h = t[o],
				l;
			t[o] = function () {
				return ((r = nn(Array.prototype.slice.call(arguments, 0))), (l = h.apply(t, arguments)), t._trace({ method: o, args: r }), l);
			};
		};
		for (n = 0; n < e; n++) a(Fe[n]);
		t.setAttr = function () {
			i.apply(t, arguments);
			const o = arguments[0];
			let h = arguments[1];
			((o === 'shadowOffsetX' || o === 'shadowOffsetY' || o === 'shadowBlur') && (h = h / this.canvas.getPixelRatio()),
				t._trace({ property: o, val: h }));
		};
	}
	_applyGlobalCompositeOperation(t) {
		const e = t.attrs.globalCompositeOperation;
		!e || e === 'source-over' || this.setAttr('globalCompositeOperation', e);
	}
}
dn.forEach(function (s) {
	Object.defineProperty(oe.prototype, s, {
		get() {
			return this._context[s];
		},
		set(t) {
			this._context[s] = t;
		}
	});
});
class un extends oe {
	constructor(t, { willReadFrequently: e = !1 } = {}) {
		(super(t), (this._context = t._canvas.getContext('2d', { willReadFrequently: e })));
	}
	_fillColor(t) {
		const e = t.fill();
		(this.setAttr('fillStyle', e), t._fillFunc(this));
	}
	_fillPattern(t) {
		(this.setAttr('fillStyle', t._getFillPattern()), t._fillFunc(this));
	}
	_fillLinearGradient(t) {
		const e = t._getLinearGradient();
		e && (this.setAttr('fillStyle', e), t._fillFunc(this));
	}
	_fillRadialGradient(t) {
		const e = t._getRadialGradient();
		e && (this.setAttr('fillStyle', e), t._fillFunc(this));
	}
	_fill(t) {
		const e = t.fill(),
			i = t.getFillPriority();
		if (e && i === 'color') {
			this._fillColor(t);
			return;
		}
		const n = t.getFillPatternImage();
		if (n && i === 'pattern') {
			this._fillPattern(t);
			return;
		}
		const r = t.getFillLinearGradientColorStops();
		if (r && i === 'linear-gradient') {
			this._fillLinearGradient(t);
			return;
		}
		const a = t.getFillRadialGradientColorStops();
		if (a && i === 'radial-gradient') {
			this._fillRadialGradient(t);
			return;
		}
		e ? this._fillColor(t) : n ? this._fillPattern(t) : r ? this._fillLinearGradient(t) : a && this._fillRadialGradient(t);
	}
	_strokeLinearGradient(t) {
		const e = t.getStrokeLinearGradientStartPoint(),
			i = t.getStrokeLinearGradientEndPoint(),
			n = t.getStrokeLinearGradientColorStops(),
			r = this.createLinearGradient(e.x, e.y, i.x, i.y);
		if (n) {
			for (let a = 0; a < n.length; a += 2) r.addColorStop(n[a], n[a + 1]);
			this.setAttr('strokeStyle', r);
		}
	}
	_stroke(t) {
		const e = t.dash(),
			i = t.getStrokeScaleEnabled();
		if (t.hasStroke()) {
			if (!i) {
				this.save();
				const r = this.getCanvas().getPixelRatio();
				this.setTransform(r, 0, 0, r, 0, 0);
			}
			(this._applyLineCap(t),
				e && t.dashEnabled() && (this.setLineDash(e), this.setAttr('lineDashOffset', t.dashOffset())),
				this.setAttr('lineWidth', t.strokeWidth()),
				t.getShadowForStrokeEnabled() || this.setAttr('shadowColor', 'rgba(0,0,0,0)'),
				t.getStrokeLinearGradientColorStops() ? this._strokeLinearGradient(t) : this.setAttr('strokeStyle', t.stroke()),
				t._strokeFunc(this),
				i || this.restore());
		}
	}
	_applyShadow(t) {
		var e, i, n;
		const r = (e = t.getShadowRGBA()) !== null && e !== void 0 ? e : 'black',
			a = (i = t.getShadowBlur()) !== null && i !== void 0 ? i : 5,
			o = (n = t.getShadowOffset()) !== null && n !== void 0 ? n : { x: 0, y: 0 },
			h = t.getAbsoluteScale(),
			l = this.canvas.getPixelRatio(),
			c = h.x * l,
			f = h.y * l;
		(this.setAttr('shadowColor', r),
			this.setAttr('shadowBlur', a * Math.min(Math.abs(c), Math.abs(f))),
			this.setAttr('shadowOffsetX', o.x * c),
			this.setAttr('shadowOffsetY', o.y * f));
	}
}
class gn extends oe {
	constructor(t) {
		(super(t), (this._context = t._canvas.getContext('2d', { willReadFrequently: !0 })));
	}
	_fill(t) {
		(this.save(), this.setAttr('fillStyle', t.colorKey), t._fillFuncHit(this), this.restore());
	}
	strokeShape(t) {
		t.hasHitStroke() && this._stroke(t);
	}
	_stroke(t) {
		if (t.hasHitStroke()) {
			const e = t.getStrokeScaleEnabled();
			if (!e) {
				this.save();
				const r = this.getCanvas().getPixelRatio();
				this.setTransform(r, 0, 0, r, 0, 0);
			}
			this._applyLineCap(t);
			const i = t.hitStrokeWidth(),
				n = i === 'auto' ? t.strokeWidth() : i;
			(this.setAttr('lineWidth', n), this.setAttr('strokeStyle', t.colorKey), t._strokeFuncHit(this), e || this.restore());
		}
	}
}
let $t;
function pn() {
	if ($t) return $t;
	const s = m.createCanvasElement(),
		t = s.getContext('2d');
	return (
		($t = (function () {
			const e = A._global.devicePixelRatio || 1,
				i =
					t.webkitBackingStorePixelRatio ||
					t.mozBackingStorePixelRatio ||
					t.msBackingStorePixelRatio ||
					t.oBackingStorePixelRatio ||
					t.backingStorePixelRatio ||
					1;
			return e / i;
		})()),
		m.releaseCanvas(s),
		$t
	);
}
class Ae {
	constructor(t) {
		((this.pixelRatio = 1), (this.width = 0), (this.height = 0), (this.isCache = !1));
		const i = (t || {}).pixelRatio || A.pixelRatio || pn();
		((this.pixelRatio = i),
			(this._canvas = m.createCanvasElement()),
			(this._canvas.style.padding = '0'),
			(this._canvas.style.margin = '0'),
			(this._canvas.style.border = '0'),
			(this._canvas.style.background = 'transparent'),
			(this._canvas.style.position = 'absolute'),
			(this._canvas.style.top = '0'),
			(this._canvas.style.left = '0'));
	}
	getContext() {
		return this.context;
	}
	getPixelRatio() {
		return this.pixelRatio;
	}
	setPixelRatio(t) {
		const e = this.pixelRatio;
		((this.pixelRatio = t), this.setSize(this.getWidth() / e, this.getHeight() / e));
	}
	setWidth(t) {
		((this.width = this._canvas.width = t * this.pixelRatio), (this._canvas.style.width = t + 'px'));
		const e = this.pixelRatio;
		this.getContext()._context.scale(e, e);
	}
	setHeight(t) {
		((this.height = this._canvas.height = t * this.pixelRatio), (this._canvas.style.height = t + 'px'));
		const e = this.pixelRatio;
		this.getContext()._context.scale(e, e);
	}
	getWidth() {
		return this.width;
	}
	getHeight() {
		return this.height;
	}
	setSize(t, e) {
		(this.setWidth(t || 0), this.setHeight(e || 0));
	}
	toDataURL(t, e) {
		try {
			return this._canvas.toDataURL(t, e);
		} catch {
			try {
				return this._canvas.toDataURL();
			} catch (n) {
				return (m.error('Unable to get data URL. ' + n.message + ' For more info read https://konvajs.org/docs/posts/Tainted_Canvas.html.'), '');
			}
		}
	}
}
class ft extends Ae {
	constructor(t = { width: 0, height: 0, willReadFrequently: !1 }) {
		(super(t), (this.context = new un(this, { willReadFrequently: t.willReadFrequently })), this.setSize(t.width, t.height));
	}
}
class Re extends Ae {
	constructor(t = { width: 0, height: 0 }) {
		(super(t), (this.hitCanvas = !0), (this.context = new gn(this)), this.setSize(t.width, t.height));
	}
}
const z = {
	get isDragging() {
		let s = !1;
		return (
			z._dragElements.forEach((t) => {
				t.dragStatus === 'dragging' && (s = !0);
			}),
			s
		);
	},
	justDragged: !1,
	get node() {
		let s;
		return (
			z._dragElements.forEach((t) => {
				s = t.node;
			}),
			s
		);
	},
	_dragElements: new Map(),
	_drag(s) {
		const t = [];
		(z._dragElements.forEach((e, i) => {
			const { node: n } = e,
				r = n.getStage();
			(r.setPointersPositions(s), e.pointerId === void 0 && (e.pointerId = m._getFirstPointerId(s)));
			const a = r._changedPointerPositions.find((o) => o.id === e.pointerId);
			if (a) {
				if (e.dragStatus !== 'dragging') {
					const o = n.dragDistance();
					if (Math.max(Math.abs(a.x - e.startPointerPos.x), Math.abs(a.y - e.startPointerPos.y)) < o || (n.startDrag({ evt: s }), !n.isDragging()))
						return;
				}
				(n._setDragPosition(s, e), t.push(n));
			}
		}),
			t.forEach((e) => {
				e.fire('dragmove', { type: 'dragmove', target: e, evt: s }, !0);
			}));
	},
	_endDragBefore(s) {
		const t = [];
		(z._dragElements.forEach((e) => {
			const { node: i } = e,
				n = i.getStage();
			if ((s && n.setPointersPositions(s), !n._changedPointerPositions.find((o) => o.id === e.pointerId))) return;
			(e.dragStatus === 'dragging' || e.dragStatus === 'stopped') &&
				((z.justDragged = !0), (A._mouseListenClick = !1), (A._touchListenClick = !1), (A._pointerListenClick = !1), (e.dragStatus = 'stopped'));
			const a = e.node.getLayer() || (e.node instanceof A.Stage && e.node);
			a && t.indexOf(a) === -1 && t.push(a);
		}),
			t.forEach((e) => {
				e.draw();
			}));
	},
	_endDragAfter(s) {
		z._dragElements.forEach((t, e) => {
			(t.dragStatus === 'stopped' && t.node.fire('dragend', { type: 'dragend', target: t.node, evt: s }, !0),
				t.dragStatus !== 'dragging' && z._dragElements.delete(e));
		});
	}
};
A.isBrowser &&
	(window.addEventListener('mouseup', z._endDragBefore, !0),
	window.addEventListener('touchend', z._endDragBefore, !0),
	window.addEventListener('touchcancel', z._endDragBefore, !0),
	window.addEventListener('mousemove', z._drag),
	window.addEventListener('touchmove', z._drag),
	window.addEventListener('mouseup', z._endDragAfter, !1),
	window.addEventListener('touchend', z._endDragAfter, !1),
	window.addEventListener('touchcancel', z._endDragAfter, !1));
function ut(s) {
	return m._isString(s)
		? '"' + s + '"'
		: Object.prototype.toString.call(s) === '[object Number]' || m._isBoolean(s)
			? s
			: Object.prototype.toString.call(s);
}
function hi(s) {
	return s > 255 ? 255 : s < 0 ? 0 : Math.round(s);
}
function P() {
	if (A.isUnminified)
		return function (s, t) {
			return (m._isNumber(s) || m.warn(ut(s) + ' is a not valid value for "' + t + '" attribute. The value should be a number.'), s);
		};
}
function he(s) {
	if (A.isUnminified)
		return function (t, e) {
			let i = m._isNumber(t),
				n = m._isArray(t) && t.length == s;
			return (
				!i && !n && m.warn(ut(t) + ' is a not valid value for "' + e + '" attribute. The value should be a number or Array<number>(' + s + ')'),
				t
			);
		};
}
function Me() {
	if (A.isUnminified)
		return function (s, t) {
			return (
				m._isNumber(s) || s === 'auto' || m.warn(ut(s) + ' is a not valid value for "' + t + '" attribute. The value should be a number or "auto".'),
				s
			);
		};
}
function bt() {
	if (A.isUnminified)
		return function (s, t) {
			return (m._isString(s) || m.warn(ut(s) + ' is a not valid value for "' + t + '" attribute. The value should be a string.'), s);
		};
}
function li() {
	if (A.isUnminified)
		return function (s, t) {
			const e = m._isString(s),
				i = Object.prototype.toString.call(s) === '[object CanvasGradient]' || (s && s.addColorStop);
			return (e || i || m.warn(ut(s) + ' is a not valid value for "' + t + '" attribute. The value should be a string or a native gradient.'), s);
		};
}
function mn() {
	if (A.isUnminified)
		return function (s, t) {
			const e = Int8Array ? Object.getPrototypeOf(Int8Array) : null;
			return (
				(e && s instanceof e) ||
					(m._isArray(s)
						? s.forEach(function (i) {
								m._isNumber(i) || m.warn('"' + t + '" attribute has non numeric element ' + i + '. Make sure that all elements are numbers.');
							})
						: m.warn(ut(s) + ' is a not valid value for "' + t + '" attribute. The value should be a array of numbers.')),
				s
			);
		};
}
function st() {
	if (A.isUnminified)
		return function (s, t) {
			return (s === !0 || s === !1 || m.warn(ut(s) + ' is a not valid value for "' + t + '" attribute. The value should be a boolean.'), s);
		};
}
function _n(s) {
	if (A.isUnminified)
		return function (t, e) {
			return (
				t == null ||
					m.isObject(t) ||
					m.warn(ut(t) + ' is a not valid value for "' + e + '" attribute. The value should be an object with properties ' + s),
				t
			);
		};
}
const Ot = 'get',
	Lt = 'set',
	u = {
		addGetterSetter(s, t, e, i, n) {
			(u.addGetter(s, t, e), u.addSetter(s, t, i, n), u.addOverloadedGetterSetter(s, t));
		},
		addGetter(s, t, e) {
			const i = Ot + m._capitalize(t);
			s.prototype[i] =
				s.prototype[i] ||
				function () {
					const n = this.attrs[t];
					return n === void 0 ? e : n;
				};
		},
		addSetter(s, t, e, i) {
			const n = Lt + m._capitalize(t);
			s.prototype[n] || u.overWriteSetter(s, t, e, i);
		},
		overWriteSetter(s, t, e, i) {
			const n = Lt + m._capitalize(t);
			s.prototype[n] = function (r) {
				return (e && r !== void 0 && r !== null && (r = e.call(this, r, t)), this._setAttr(t, r), i && i.call(this), this);
			};
		},
		addComponentsGetterSetter(s, t, e, i, n) {
			const r = e.length,
				a = m._capitalize,
				o = Ot + a(t),
				h = Lt + a(t);
			s.prototype[o] = function () {
				const c = {};
				for (let f = 0; f < r; f++) {
					const d = e[f];
					c[d] = this.getAttr(t + a(d));
				}
				return c;
			};
			const l = _n(e);
			((s.prototype[h] = function (c) {
				const f = this.attrs[t];
				(i && (c = i.call(this, c, t)), l && l.call(this, c, t));
				for (const d in c) c.hasOwnProperty(d) && this._setAttr(t + a(d), c[d]);
				return (
					c ||
						e.forEach((d) => {
							this._setAttr(t + a(d), void 0);
						}),
					this._fireChangeEvent(t, f, c),
					n && n.call(this),
					this
				);
			}),
				u.addOverloadedGetterSetter(s, t));
		},
		addOverloadedGetterSetter(s, t) {
			const e = m._capitalize(t),
				i = Lt + e,
				n = Ot + e;
			s.prototype[t] = function () {
				return arguments.length ? (this[i](arguments[0]), this) : this[n]();
			};
		},
		addDeprecatedGetterSetter(s, t, e, i) {
			m.error('Adding deprecated ' + t);
			const n = Ot + m._capitalize(t),
				r = t + ' property is deprecated and will be removed soon. Look at Konva change log for more information.';
			((s.prototype[n] = function () {
				m.error(r);
				const a = this.attrs[t];
				return a === void 0 ? e : a;
			}),
				u.addSetter(s, t, i, function () {
					m.error(r);
				}),
				u.addOverloadedGetterSetter(s, t));
		},
		backCompat(s, t) {
			m.each(t, function (e, i) {
				const n = s.prototype[i],
					r = Ot + m._capitalize(e),
					a = Lt + m._capitalize(e);
				function o() {
					(n.apply(this, arguments), m.error('"' + e + '" method is deprecated and will be removed soon. Use ""' + i + '" instead.'));
				}
				((s.prototype[e] = o), (s.prototype[r] = o), (s.prototype[a] = o));
			});
		},
		afterSetFilter() {
			this._filterUpToDate = !1;
		}
	};
function yn(s) {
	const t = /(\w+)\(([^)]+)\)/g;
	let e;
	for (; (e = t.exec(s)) !== null; ) {
		const [, i, n] = e;
		switch (i) {
			case 'blur': {
				const r = parseFloat(n.replace('px', ''));
				return function (a) {
					this.blurRadius(r * 0.5);
					const o = A.Filters;
					o && o.Blur && o.Blur.call(this, a);
				};
			}
			case 'brightness': {
				const r = n.includes('%') ? parseFloat(n) / 100 : parseFloat(n);
				return function (a) {
					this.brightness(r);
					const o = A.Filters;
					o && o.Brightness && o.Brightness.call(this, a);
				};
			}
			case 'contrast': {
				const r = parseFloat(n);
				return function (a) {
					const o = 100 * (Math.sqrt(r) - 1);
					this.contrast(o);
					const h = A.Filters;
					h && h.Contrast && h.Contrast.call(this, a);
				};
			}
			case 'grayscale':
				return function (r) {
					const a = A.Filters;
					a && a.Grayscale && a.Grayscale.call(this, r);
				};
			case 'sepia':
				return function (r) {
					const a = A.Filters;
					a && a.Sepia && a.Sepia.call(this, r);
				};
			case 'invert':
				return function (r) {
					const a = A.Filters;
					a && a.Invert && a.Invert.call(this, r);
				};
			default:
				m.warn(`CSS filter "${i}" is not supported in fallback mode. Consider using function filters for better compatibility.`);
				break;
		}
	}
	return () => {};
}
const se = 'absoluteOpacity',
	He = 'allEventListeners',
	at = 'absoluteTransform',
	We = 'absoluteScale',
	yt = 'canvas',
	Sn = 'Change',
	bn = 'children',
	vn = 'konva',
	ye = 'listening',
	Cn = 'mouseenter',
	xn = 'mouseleave',
	wn = 'pointerenter',
	Tn = 'pointerleave',
	En = 'touchenter',
	Pn = 'touchleave',
	ze = 'set',
	Ye = 'Shape',
	re = ' ',
	Xe = 'stage',
	ct = 'transform',
	kn = 'Stage',
	Se = 'visible',
	An = [
		'xChange.konva',
		'yChange.konva',
		'scaleXChange.konva',
		'scaleYChange.konva',
		'skewXChange.konva',
		'skewYChange.konva',
		'rotationChange.konva',
		'offsetXChange.konva',
		'offsetYChange.konva',
		'transformsEnabledChange.konva'
	].join(re);
let Rn = 1;
class E {
	constructor(t) {
		((this._id = Rn++),
			(this.eventListeners = {}),
			(this.attrs = {}),
			(this.index = 0),
			(this._allEventListeners = null),
			(this.parent = null),
			(this._cache = new Map()),
			(this._attachedDepsListeners = new Map()),
			(this._lastPos = null),
			(this._batchingTransformChange = !1),
			(this._needClearTransformCache = !1),
			(this._filterUpToDate = !1),
			(this._isUnderCache = !1),
			(this._dragEventId = null),
			(this._shouldFireChangeEvents = !1),
			this.setAttrs(t),
			(this._shouldFireChangeEvents = !0));
	}
	hasChildren() {
		return !1;
	}
	_clearCache(t) {
		(t === ct || t === at) && this._cache.get(t) ? (this._cache.get(t).dirty = !0) : t ? this._cache.delete(t) : this._cache.clear();
	}
	_getCache(t, e) {
		let i = this._cache.get(t);
		return ((i === void 0 || ((t === ct || t === at) && i.dirty === !0)) && ((i = e.call(this)), this._cache.set(t, i)), i);
	}
	_calculate(t, e, i) {
		if (!this._attachedDepsListeners.get(t)) {
			const n = e.map((r) => r + 'Change.konva').join(re);
			(this.on(n, () => {
				this._clearCache(t);
			}),
				this._attachedDepsListeners.set(t, !0));
		}
		return this._getCache(t, i);
	}
	_getCanvasCache() {
		return this._cache.get(yt);
	}
	_clearSelfAndDescendantCache(t) {
		(this._clearCache(t), t === at && this.fire('absoluteTransformChange'));
	}
	clearCache() {
		if (this._cache.has(yt)) {
			const { scene: t, filter: e, hit: i } = this._cache.get(yt);
			(m.releaseCanvas(t._canvas, e._canvas, i._canvas), this._cache.delete(yt));
		}
		return (this._clearSelfAndDescendantCache(), this._requestDraw(), this);
	}
	cache(t) {
		const e = t || {};
		let i = {};
		(e.x === void 0 || e.y === void 0 || e.width === void 0 || e.height === void 0) &&
			(i = this.getClientRect({ skipTransform: !0, relativeTo: this.getParent() || void 0 }));
		let n = Math.ceil(e.width || i.width),
			r = Math.ceil(e.height || i.height),
			a = e.pixelRatio,
			o = e.x === void 0 ? Math.floor(i.x) : e.x,
			h = e.y === void 0 ? Math.floor(i.y) : e.y,
			l = e.offset || 0,
			c = e.drawBorder || !1,
			f = e.hitCanvasPixelRatio || 1;
		if (!n || !r) {
			m.error('Can not cache the node. Width or height of the node equals 0. Caching is skipped.');
			return;
		}
		const d = Math.abs(Math.round(i.x) - o) > 0.5 ? 1 : 0,
			p = Math.abs(Math.round(i.y) - h) > 0.5 ? 1 : 0;
		((n += l * 2 + d), (r += l * 2 + p), (o -= l), (h -= l));
		const g = new ft({ pixelRatio: a, width: n, height: r }),
			_ = new ft({ pixelRatio: a, width: 0, height: 0, willReadFrequently: !0 }),
			b = new Re({ pixelRatio: f, width: n, height: r }),
			y = g.getContext(),
			S = b.getContext(),
			C = new ft({ width: g.width / g.pixelRatio + Math.abs(o), height: g.height / g.pixelRatio + Math.abs(h), pixelRatio: g.pixelRatio }),
			v = C.getContext();
		return (
			(b.isCache = !0),
			(g.isCache = !0),
			this._cache.delete(yt),
			(this._filterUpToDate = !1),
			e.imageSmoothingEnabled === !1 && ((g.getContext()._context.imageSmoothingEnabled = !1), (_.getContext()._context.imageSmoothingEnabled = !1)),
			y.save(),
			S.save(),
			v.save(),
			y.translate(-o, -h),
			S.translate(-o, -h),
			v.translate(-o, -h),
			(C.x = o),
			(C.y = h),
			(this._isUnderCache = !0),
			this._clearSelfAndDescendantCache(se),
			this._clearSelfAndDescendantCache(We),
			this.drawScene(g, this, C),
			this.drawHit(b, this),
			(this._isUnderCache = !1),
			y.restore(),
			S.restore(),
			c &&
				(y.save(),
				y.beginPath(),
				y.rect(0, 0, n, r),
				y.closePath(),
				y.setAttr('strokeStyle', 'red'),
				y.setAttr('lineWidth', 5),
				y.stroke(),
				y.restore()),
			m.releaseCanvas(C._canvas),
			this._cache.set(yt, { scene: g, filter: _, hit: b, x: o, y: h }),
			this._requestDraw(),
			this
		);
	}
	isCached() {
		return this._cache.has(yt);
	}
	getClientRect(t) {
		throw new Error('abstract "getClientRect" method call');
	}
	_transformedRect(t, e) {
		const i = [
			{ x: t.x, y: t.y },
			{ x: t.x + t.width, y: t.y },
			{ x: t.x + t.width, y: t.y + t.height },
			{ x: t.x, y: t.y + t.height }
		];
		let n = 1 / 0,
			r = 1 / 0,
			a = -1 / 0,
			o = -1 / 0;
		const h = this.getAbsoluteTransform(e);
		return (
			i.forEach(function (l) {
				const c = h.point(l);
				(n === void 0 && ((n = a = c.x), (r = o = c.y)),
					(n = Math.min(n, c.x)),
					(r = Math.min(r, c.y)),
					(a = Math.max(a, c.x)),
					(o = Math.max(o, c.y)));
			}),
			{ x: n, y: r, width: a - n, height: o - r }
		);
	}
	_drawCachedSceneCanvas(t) {
		(t.save(), t._applyOpacity(this), t._applyGlobalCompositeOperation(this));
		const e = this._getCanvasCache();
		t.translate(e.x, e.y);
		const i = this._getCachedSceneCanvas(),
			n = i.pixelRatio;
		(t.drawImage(i._canvas, 0, 0, i.width / n, i.height / n), t.restore());
	}
	_drawCachedHitCanvas(t) {
		const e = this._getCanvasCache(),
			i = e.hit;
		(t.save(), t.translate(e.x, e.y), t.drawImage(i._canvas, 0, 0, i.width / i.pixelRatio, i.height / i.pixelRatio), t.restore());
	}
	_getCachedSceneCanvas() {
		let t = this.filters(),
			e = this._getCanvasCache(),
			i = e.scene,
			n = e.filter,
			r = n.getContext(),
			a,
			o,
			h,
			l;
		if (!t || t.length === 0) return i;
		if (this._filterUpToDate) return n;
		let c = !0;
		for (let d = 0; d < t.length; d++)
			if ((typeof t[d] == 'string' && Be(), typeof t[d] != 'string' || !Be())) {
				c = !1;
				break;
			}
		const f = i.pixelRatio;
		if ((n.setSize(i.width / i.pixelRatio, i.height / i.pixelRatio), c)) {
			const d = t.join(' ');
			return (
				r.save(),
				r.setAttr('filter', d),
				r.drawImage(i._canvas, 0, 0, i.getWidth() / f, i.getHeight() / f),
				r.restore(),
				(this._filterUpToDate = !0),
				n
			);
		}
		try {
			for (
				a = t.length,
					r.clear(),
					r.drawImage(i._canvas, 0, 0, i.getWidth() / f, i.getHeight() / f),
					o = r.getImageData(0, 0, n.getWidth(), n.getHeight()),
					h = 0;
				h < a;
				h++
			)
				((l = t[h]), typeof l == 'string' && (l = yn(l)), l.call(this, o), r.putImageData(o, 0, 0));
		} catch (d) {
			m.error('Unable to apply filter. ' + d.message + ' This post my help you https://konvajs.org/docs/posts/Tainted_Canvas.html.');
		}
		return ((this._filterUpToDate = !0), n);
	}
	on(t, e) {
		if ((this._cache && this._cache.delete(He), arguments.length === 3)) return this._delegate.apply(this, arguments);
		const i = t.split(re);
		for (let n = 0; n < i.length; n++) {
			const a = i[n].split('.'),
				o = a[0],
				h = a[1] || '';
			(this.eventListeners[o] || (this.eventListeners[o] = []), this.eventListeners[o].push({ name: h, handler: e }));
		}
		return this;
	}
	off(t, e) {
		let i = (t || '').split(re),
			n = i.length,
			r,
			a,
			o,
			h,
			l,
			c;
		if ((this._cache && this._cache.delete(He), !t)) for (a in this.eventListeners) this._off(a);
		for (r = 0; r < n; r++)
			if (((o = i[r]), (h = o.split('.')), (l = h[0]), (c = h[1]), l)) this.eventListeners[l] && this._off(l, c, e);
			else for (a in this.eventListeners) this._off(a, c, e);
		return this;
	}
	dispatchEvent(t) {
		const e = { target: this, type: t.type, evt: t };
		return (this.fire(t.type, e), this);
	}
	addEventListener(t, e) {
		return (
			this.on(t, function (i) {
				e.call(this, i.evt);
			}),
			this
		);
	}
	removeEventListener(t) {
		return (this.off(t), this);
	}
	_delegate(t, e, i) {
		const n = this;
		this.on(t, function (r) {
			const a = r.target.findAncestors(e, !0, n);
			for (let o = 0; o < a.length; o++) ((r = m.cloneObject(r)), (r.currentTarget = a[o]), i.call(a[o], r));
		});
	}
	remove() {
		return (this.isDragging() && this.stopDrag(), z._dragElements.delete(this._id), this._remove(), this);
	}
	_clearCaches() {
		(this._clearSelfAndDescendantCache(at),
			this._clearSelfAndDescendantCache(se),
			this._clearSelfAndDescendantCache(We),
			this._clearSelfAndDescendantCache(Xe),
			this._clearSelfAndDescendantCache(Se),
			this._clearSelfAndDescendantCache(ye));
	}
	_remove() {
		this._clearCaches();
		const t = this.getParent();
		t && t.children && (t.children.splice(this.index, 1), t._setChildrenIndices(), (this.parent = null));
	}
	destroy() {
		return (this.remove(), this.clearCache(), this);
	}
	getAttr(t) {
		const e = 'get' + m._capitalize(t);
		return m._isFunction(this[e]) ? this[e]() : this.attrs[t];
	}
	getAncestors() {
		let t = this.getParent(),
			e = [];
		for (; t; ) (e.push(t), (t = t.getParent()));
		return e;
	}
	getAttrs() {
		return this.attrs || {};
	}
	setAttrs(t) {
		return (
			this._batchTransformChanges(() => {
				let e, i;
				if (!t) return this;
				for (e in t) e !== bn && ((i = ze + m._capitalize(e)), m._isFunction(this[i]) ? this[i](t[e]) : this._setAttr(e, t[e]));
			}),
			this
		);
	}
	isListening() {
		return this._getCache(ye, this._isListening);
	}
	_isListening(t) {
		if (!this.listening()) return !1;
		const i = this.getParent();
		return i && i !== t && this !== t ? i._isListening(t) : !0;
	}
	isVisible() {
		return this._getCache(Se, this._isVisible);
	}
	_isVisible(t) {
		if (!this.visible()) return !1;
		const i = this.getParent();
		return i && i !== t && this !== t ? i._isVisible(t) : !0;
	}
	shouldDrawHit(t, e = !1) {
		if (t) return this._isVisible(t) && this._isListening(t);
		const i = this.getLayer();
		let n = !1;
		z._dragElements.forEach((a) => {
			a.dragStatus === 'dragging' && (a.node.nodeType === 'Stage' || a.node.getLayer() === i) && (n = !0);
		});
		const r = !e && !A.hitOnDragEnabled && (n || A.isTransforming());
		return this.isListening() && this.isVisible() && !r;
	}
	show() {
		return (this.visible(!0), this);
	}
	hide() {
		return (this.visible(!1), this);
	}
	getZIndex() {
		return this.index || 0;
	}
	getAbsoluteZIndex() {
		let t = this.getDepth(),
			e = this,
			i = 0,
			n,
			r,
			a,
			o;
		function h(c) {
			for (n = [], r = c.length, a = 0; a < r; a++)
				((o = c[a]), i++, o.nodeType !== Ye && (n = n.concat(o.getChildren().slice())), o._id === e._id && (a = r));
			n.length > 0 && n[0].getDepth() <= t && h(n);
		}
		const l = this.getStage();
		return (e.nodeType !== kn && l && h(l.getChildren()), i);
	}
	getDepth() {
		let t = 0,
			e = this.parent;
		for (; e; ) (t++, (e = e.parent));
		return t;
	}
	_batchTransformChanges(t) {
		((this._batchingTransformChange = !0),
			t(),
			(this._batchingTransformChange = !1),
			this._needClearTransformCache && (this._clearCache(ct), this._clearSelfAndDescendantCache(at)),
			(this._needClearTransformCache = !1));
	}
	setPosition(t) {
		return (
			this._batchTransformChanges(() => {
				(this.x(t.x), this.y(t.y));
			}),
			this
		);
	}
	getPosition() {
		return { x: this.x(), y: this.y() };
	}
	getRelativePointerPosition() {
		const t = this.getStage();
		if (!t) return null;
		const e = t.getPointerPosition();
		if (!e) return null;
		const i = this.getAbsoluteTransform().copy();
		return (i.invert(), i.point(e));
	}
	getAbsolutePosition(t) {
		let e = !1,
			i = this.parent;
		for (; i; ) {
			if (i.isCached()) {
				e = !0;
				break;
			}
			i = i.parent;
		}
		e && !t && (t = !0);
		const n = this.getAbsoluteTransform(t).getMatrix(),
			r = new tt(),
			a = this.offset();
		return ((r.m = n.slice()), r.translate(a.x, a.y), r.getTranslation());
	}
	setAbsolutePosition(t) {
		const { x: e, y: i, ...n } = this._clearTransform();
		((this.attrs.x = e), (this.attrs.y = i), this._clearCache(ct));
		const r = this._getAbsoluteTransform().copy();
		return (
			r.invert(),
			r.translate(t.x, t.y),
			(t = { x: this.attrs.x + r.getTranslation().x, y: this.attrs.y + r.getTranslation().y }),
			this._setTransform(n),
			this.setPosition({ x: t.x, y: t.y }),
			this._clearCache(ct),
			this._clearSelfAndDescendantCache(at),
			this
		);
	}
	_setTransform(t) {
		let e;
		for (e in t) this.attrs[e] = t[e];
	}
	_clearTransform() {
		const t = {
			x: this.x(),
			y: this.y(),
			rotation: this.rotation(),
			scaleX: this.scaleX(),
			scaleY: this.scaleY(),
			offsetX: this.offsetX(),
			offsetY: this.offsetY(),
			skewX: this.skewX(),
			skewY: this.skewY()
		};
		return (
			(this.attrs.x = 0),
			(this.attrs.y = 0),
			(this.attrs.rotation = 0),
			(this.attrs.scaleX = 1),
			(this.attrs.scaleY = 1),
			(this.attrs.offsetX = 0),
			(this.attrs.offsetY = 0),
			(this.attrs.skewX = 0),
			(this.attrs.skewY = 0),
			t
		);
	}
	move(t) {
		let e = t.x,
			i = t.y,
			n = this.x(),
			r = this.y();
		return (e !== void 0 && (n += e), i !== void 0 && (r += i), this.setPosition({ x: n, y: r }), this);
	}
	_eachAncestorReverse(t, e) {
		let i = [],
			n = this.getParent(),
			r,
			a;
		if (!(e && e._id === this._id)) {
			for (i.unshift(this); n && (!e || n._id !== e._id); ) (i.unshift(n), (n = n.parent));
			for (r = i.length, a = 0; a < r; a++) t(i[a]);
		}
	}
	rotate(t) {
		return (this.rotation(this.rotation() + t), this);
	}
	moveToTop() {
		if (!this.parent) return (m.warn('Node has no parent. moveToTop function is ignored.'), !1);
		const t = this.index,
			e = this.parent.getChildren().length;
		return t < e - 1 ? (this.parent.children.splice(t, 1), this.parent.children.push(this), this.parent._setChildrenIndices(), !0) : !1;
	}
	moveUp() {
		if (!this.parent) return (m.warn('Node has no parent. moveUp function is ignored.'), !1);
		const t = this.index,
			e = this.parent.getChildren().length;
		return t < e - 1 ? (this.parent.children.splice(t, 1), this.parent.children.splice(t + 1, 0, this), this.parent._setChildrenIndices(), !0) : !1;
	}
	moveDown() {
		if (!this.parent) return (m.warn('Node has no parent. moveDown function is ignored.'), !1);
		const t = this.index;
		return t > 0 ? (this.parent.children.splice(t, 1), this.parent.children.splice(t - 1, 0, this), this.parent._setChildrenIndices(), !0) : !1;
	}
	moveToBottom() {
		if (!this.parent) return (m.warn('Node has no parent. moveToBottom function is ignored.'), !1);
		const t = this.index;
		return t > 0 ? (this.parent.children.splice(t, 1), this.parent.children.unshift(this), this.parent._setChildrenIndices(), !0) : !1;
	}
	setZIndex(t) {
		if (!this.parent) return (m.warn('Node has no parent. zIndex parameter is ignored.'), this);
		(t < 0 || t >= this.parent.children.length) &&
			m.warn(
				'Unexpected value ' +
					t +
					' for zIndex property. zIndex is just index of a node in children of its parent. Expected value is from 0 to ' +
					(this.parent.children.length - 1) +
					'.'
			);
		const e = this.index;
		return (this.parent.children.splice(e, 1), this.parent.children.splice(t, 0, this), this.parent._setChildrenIndices(), this);
	}
	getAbsoluteOpacity() {
		return this._getCache(se, this._getAbsoluteOpacity);
	}
	_getAbsoluteOpacity() {
		let t = this.opacity();
		const e = this.getParent();
		return (e && !e._isUnderCache && (t *= e.getAbsoluteOpacity()), t);
	}
	moveTo(t) {
		return (this.getParent() !== t && (this._remove(), t.add(this)), this);
	}
	toObject() {
		let t = this.getAttrs(),
			e,
			i,
			n,
			r,
			a;
		const o = { attrs: {}, className: this.getClassName() };
		for (e in t)
			((i = t[e]),
				(a = m.isObject(i) && !m._isPlainObject(i) && !m._isArray(i)),
				!a && ((n = typeof this[e] == 'function' && this[e]), delete t[e], (r = n ? n.call(this) : null), (t[e] = i), r !== i && (o.attrs[e] = i)));
		return m._prepareToStringify(o);
	}
	toJSON() {
		return JSON.stringify(this.toObject());
	}
	getParent() {
		return this.parent;
	}
	findAncestors(t, e, i) {
		const n = [];
		e && this._isMatch(t) && n.push(this);
		let r = this.parent;
		for (; r; ) {
			if (r === i) return n;
			(r._isMatch(t) && n.push(r), (r = r.parent));
		}
		return n;
	}
	isAncestorOf(t) {
		return !1;
	}
	findAncestor(t, e, i) {
		return this.findAncestors(t, e, i)[0];
	}
	_isMatch(t) {
		if (!t) return !1;
		if (typeof t == 'function') return t(this);
		let e = t.replace(/ /g, '').split(','),
			i = e.length,
			n,
			r;
		for (n = 0; n < i; n++)
			if (
				((r = e[n]),
				m.isValidSelector(r) ||
					(m.warn('Selector "' + r + '" is invalid. Allowed selectors examples are "#foo", ".bar" or "Group".'),
					m.warn('If you have a custom shape with such className, please change it to start with upper letter like "Triangle".'),
					m.warn('Konva is awesome, right?')),
				r.charAt(0) === '#')
			) {
				if (this.id() === r.slice(1)) return !0;
			} else if (r.charAt(0) === '.') {
				if (this.hasName(r.slice(1))) return !0;
			} else if (this.className === r || this.nodeType === r) return !0;
		return !1;
	}
	getLayer() {
		const t = this.getParent();
		return t ? t.getLayer() : null;
	}
	getStage() {
		return this._getCache(Xe, this._getStage);
	}
	_getStage() {
		const t = this.getParent();
		return t ? t.getStage() : null;
	}
	fire(t, e = {}, i) {
		return ((e.target = e.target || this), i ? this._fireAndBubble(t, e) : this._fire(t, e), this);
	}
	getAbsoluteTransform(t) {
		return t ? this._getAbsoluteTransform(t) : this._getCache(at, this._getAbsoluteTransform);
	}
	_getAbsoluteTransform(t) {
		let e;
		if (t)
			return (
				(e = new tt()),
				this._eachAncestorReverse(function (i) {
					const n = i.transformsEnabled();
					n === 'all' ? e.multiply(i.getTransform()) : n === 'position' && e.translate(i.x() - i.offsetX(), i.y() - i.offsetY());
				}, t),
				e
			);
		{
			((e = this._cache.get(at) || new tt()), this.parent ? this.parent.getAbsoluteTransform().copyInto(e) : e.reset());
			const i = this.transformsEnabled();
			if (i === 'all') e.multiply(this.getTransform());
			else if (i === 'position') {
				const n = this.attrs.x || 0,
					r = this.attrs.y || 0,
					a = this.attrs.offsetX || 0,
					o = this.attrs.offsetY || 0;
				e.translate(n - a, r - o);
			}
			return ((e.dirty = !1), e);
		}
	}
	getAbsoluteScale(t) {
		let e = this;
		for (; e; ) (e._isUnderCache && (t = e), (e = e.getParent()));
		const n = this.getAbsoluteTransform(t).decompose();
		return { x: n.scaleX, y: n.scaleY };
	}
	getAbsoluteRotation() {
		return this.getAbsoluteTransform().decompose().rotation;
	}
	getTransform() {
		return this._getCache(ct, this._getTransform);
	}
	_getTransform() {
		var t, e;
		const i = this._cache.get(ct) || new tt();
		i.reset();
		const n = this.x(),
			r = this.y(),
			a = A.getAngle(this.rotation()),
			o = (t = this.attrs.scaleX) !== null && t !== void 0 ? t : 1,
			h = (e = this.attrs.scaleY) !== null && e !== void 0 ? e : 1,
			l = this.attrs.skewX || 0,
			c = this.attrs.skewY || 0,
			f = this.attrs.offsetX || 0,
			d = this.attrs.offsetY || 0;
		return (
			(n !== 0 || r !== 0) && i.translate(n, r),
			a !== 0 && i.rotate(a),
			(l !== 0 || c !== 0) && i.skew(l, c),
			(o !== 1 || h !== 1) && i.scale(o, h),
			(f !== 0 || d !== 0) && i.translate(-1 * f, -1 * d),
			(i.dirty = !1),
			i
		);
	}
	clone(t) {
		let e = m.cloneObject(this.attrs),
			i,
			n,
			r,
			a,
			o;
		for (i in t) e[i] = t[i];
		const h = new this.constructor(e);
		for (i in this.eventListeners)
			for (n = this.eventListeners[i], r = n.length, a = 0; a < r; a++)
				((o = n[a]), o.name.indexOf(vn) < 0 && (h.eventListeners[i] || (h.eventListeners[i] = []), h.eventListeners[i].push(o)));
		return h;
	}
	_toKonvaCanvas(t) {
		t = t || {};
		const e = this.getClientRect(),
			i = this.getStage(),
			n = t.x !== void 0 ? t.x : Math.floor(e.x),
			r = t.y !== void 0 ? t.y : Math.floor(e.y),
			a = t.pixelRatio || 1,
			o = new ft({
				width: t.width || Math.ceil(e.width) || (i ? i.width() : 0),
				height: t.height || Math.ceil(e.height) || (i ? i.height() : 0),
				pixelRatio: a
			}),
			h = o.getContext(),
			l = new ft({ width: o.width / o.pixelRatio + Math.abs(n), height: o.height / o.pixelRatio + Math.abs(r), pixelRatio: o.pixelRatio });
		return (
			t.imageSmoothingEnabled === !1 && (h._context.imageSmoothingEnabled = !1),
			h.save(),
			(n || r) && h.translate(-1 * n, -1 * r),
			this.drawScene(o, void 0, l),
			h.restore(),
			o
		);
	}
	toCanvas(t) {
		return this._toKonvaCanvas(t)._canvas;
	}
	toDataURL(t) {
		t = t || {};
		const e = t.mimeType || null,
			i = t.quality || null,
			n = this._toKonvaCanvas(t).toDataURL(e, i);
		return (t.callback && t.callback(n), n);
	}
	toImage(t) {
		return new Promise((e, i) => {
			try {
				const n = t?.callback;
				(n && delete t.callback,
					m._urlToImage(this.toDataURL(t), function (r) {
						(e(r), n?.(r));
					}));
			} catch (n) {
				i(n);
			}
		});
	}
	toBlob(t) {
		return new Promise((e, i) => {
			try {
				const n = t?.callback;
				(n && delete t.callback,
					this.toCanvas(t).toBlob(
						(r) => {
							(e(r), n?.(r));
						},
						t?.mimeType,
						t?.quality
					));
			} catch (n) {
				i(n);
			}
		});
	}
	setSize(t) {
		return (this.width(t.width), this.height(t.height), this);
	}
	getSize() {
		return { width: this.width(), height: this.height() };
	}
	getClassName() {
		return this.className || this.nodeType;
	}
	getType() {
		return this.nodeType;
	}
	getDragDistance() {
		return this.attrs.dragDistance !== void 0 ? this.attrs.dragDistance : this.parent ? this.parent.getDragDistance() : A.dragDistance;
	}
	_off(t, e, i) {
		let n = this.eventListeners[t],
			r,
			a,
			o;
		for (r = 0; r < n.length; r++)
			if (((a = n[r].name), (o = n[r].handler), (a !== 'konva' || e === 'konva') && (!e || a === e) && (!i || i === o))) {
				if ((n.splice(r, 1), n.length === 0)) {
					delete this.eventListeners[t];
					break;
				}
				r--;
			}
	}
	_fireChangeEvent(t, e, i) {
		this._fire(t + Sn, { oldVal: e, newVal: i });
	}
	addName(t) {
		if (!this.hasName(t)) {
			const e = this.name(),
				i = e ? e + ' ' + t : t;
			this.name(i);
		}
		return this;
	}
	hasName(t) {
		if (!t) return !1;
		const e = this.name();
		return e ? (e || '').split(/\s/g).indexOf(t) !== -1 : !1;
	}
	removeName(t) {
		const e = (this.name() || '').split(/\s/g),
			i = e.indexOf(t);
		return (i !== -1 && (e.splice(i, 1), this.name(e.join(' '))), this);
	}
	setAttr(t, e) {
		const i = this[ze + m._capitalize(t)];
		return (m._isFunction(i) ? i.call(this, e) : this._setAttr(t, e), this);
	}
	_requestDraw() {
		if (A.autoDrawEnabled) {
			const t = this.getLayer() || this.getStage();
			t?.batchDraw();
		}
	}
	_setAttr(t, e) {
		const i = this.attrs[t];
		(i === e && !m.isObject(e)) ||
			(e == null ? delete this.attrs[t] : (this.attrs[t] = e), this._shouldFireChangeEvents && this._fireChangeEvent(t, i, e), this._requestDraw());
	}
	_setComponentAttr(t, e, i) {
		let n;
		i !== void 0 && ((n = this.attrs[t]), n || (this.attrs[t] = this.getAttr(t)), (this.attrs[t][e] = i), this._fireChangeEvent(t, n, i));
	}
	_fireAndBubble(t, e, i) {
		e && this.nodeType === Ye && (e.target = this);
		const n = [Cn, xn, wn, Tn, En, Pn];
		if (!(n.indexOf(t) !== -1 && ((i && (this === i || (this.isAncestorOf && this.isAncestorOf(i)))) || (this.nodeType === 'Stage' && !i)))) {
			this._fire(t, e);
			const a = n.indexOf(t) !== -1 && i && i.isAncestorOf && i.isAncestorOf(this) && !i.isAncestorOf(this.parent);
			((e && !e.cancelBubble) || !e) &&
				this.parent &&
				this.parent.isListening() &&
				!a &&
				(i && i.parent ? this._fireAndBubble.call(this.parent, t, e, i) : this._fireAndBubble.call(this.parent, t, e));
		}
	}
	_getProtoListeners(t) {
		var e, i;
		const { nodeType: n } = this,
			r = E.protoListenerMap.get(n) || {};
		let a = r?.[t];
		if (a === void 0) {
			a = [];
			let o = Object.getPrototypeOf(this);
			for (; o; ) {
				const h = (i = (e = o.eventListeners) === null || e === void 0 ? void 0 : e[t]) !== null && i !== void 0 ? i : [];
				(a.push(...h), (o = Object.getPrototypeOf(o)));
			}
			((r[t] = a), E.protoListenerMap.set(n, r));
		}
		return a;
	}
	_fire(t, e) {
		((e = e || {}), (e.currentTarget = this), (e.type = t));
		const i = this._getProtoListeners(t);
		if (i) for (let r = 0; r < i.length; r++) i[r].handler.call(this, e);
		const n = this.eventListeners[t];
		if (n) for (let r = 0; r < n.length; r++) n[r].handler.call(this, e);
	}
	draw() {
		return (this.drawScene(), this.drawHit(), this);
	}
	_createDragElement(t) {
		const e = t ? t.pointerId : void 0,
			i = this.getStage(),
			n = this.getAbsolutePosition();
		if (!i) return;
		const r = i._getPointerById(e) || i._changedPointerPositions[0] || n;
		z._dragElements.set(this._id, { node: this, startPointerPos: r, offset: { x: r.x - n.x, y: r.y - n.y }, dragStatus: 'ready', pointerId: e });
	}
	startDrag(t, e = !0) {
		z._dragElements.has(this._id) || this._createDragElement(t);
		const i = z._dragElements.get(this._id);
		((i.dragStatus = 'dragging'), this.fire('dragstart', { type: 'dragstart', target: this, evt: t && t.evt }, e));
	}
	_setDragPosition(t, e) {
		const i = this.getStage()._getPointerById(e.pointerId);
		if (!i) return;
		let n = { x: i.x - e.offset.x, y: i.y - e.offset.y };
		const r = this.dragBoundFunc();
		if (r !== void 0) {
			const a = r.call(this, n, t);
			a
				? (n = a)
				: m.warn('dragBoundFunc did not return any value. That is unexpected behavior. You must return new absolute position from dragBoundFunc.');
		}
		((!this._lastPos || this._lastPos.x !== n.x || this._lastPos.y !== n.y) && (this.setAbsolutePosition(n), this._requestDraw()),
			(this._lastPos = n));
	}
	stopDrag(t) {
		const e = z._dragElements.get(this._id);
		(e && (e.dragStatus = 'stopped'), z._endDragBefore(t), z._endDragAfter(t));
	}
	setDraggable(t) {
		(this._setAttr('draggable', t), this._dragChange());
	}
	isDragging() {
		const t = z._dragElements.get(this._id);
		return t ? t.dragStatus === 'dragging' : !1;
	}
	_listenDrag() {
		(this._dragCleanup(),
			this.on('mousedown.konva touchstart.konva', function (t) {
				if (!(!(t.evt.button !== void 0) || A.dragButtons.indexOf(t.evt.button) >= 0) || this.isDragging()) return;
				let n = !1;
				(z._dragElements.forEach((r) => {
					this.isAncestorOf(r.node) && (n = !0);
				}),
					n || this._createDragElement(t));
			}));
	}
	_dragChange() {
		if (this.attrs.draggable) this._listenDrag();
		else {
			if ((this._dragCleanup(), !this.getStage())) return;
			const e = z._dragElements.get(this._id),
				i = e && e.dragStatus === 'dragging',
				n = e && e.dragStatus === 'ready';
			i ? this.stopDrag() : n && z._dragElements.delete(this._id);
		}
	}
	_dragCleanup() {
		(this.off('mousedown.konva'), this.off('touchstart.konva'));
	}
	isClientRectOnScreen(t = { x: 0, y: 0 }) {
		const e = this.getStage();
		if (!e) return !1;
		const i = { x: -t.x, y: -t.y, width: e.width() + 2 * t.x, height: e.height() + 2 * t.y };
		return m.haveIntersection(i, this.getClientRect());
	}
	static create(t, e) {
		return (m._isString(t) && (t = JSON.parse(t)), this._createNode(t, e));
	}
	static _createNode(t, e) {
		let i = E.prototype.getClassName.call(t),
			n = t.children,
			r,
			a,
			o;
		(e && (t.attrs.container = e), A[i] || (m.warn('Can not find a node with class name "' + i + '". Fallback to "Shape".'), (i = 'Shape')));
		const h = A[i];
		if (((r = new h(t.attrs)), n)) for (a = n.length, o = 0; o < a; o++) r.add(E._createNode(n[o]));
		return r;
	}
}
E.protoListenerMap = new Map();
E.prototype.nodeType = 'Node';
E.prototype._attrsAffectingSize = [];
E.prototype.eventListeners = {};
E.prototype.on.call(E.prototype, An, function () {
	if (this._batchingTransformChange) {
		this._needClearTransformCache = !0;
		return;
	}
	(this._clearCache(ct), this._clearSelfAndDescendantCache(at));
});
E.prototype.on.call(E.prototype, 'visibleChange.konva', function () {
	this._clearSelfAndDescendantCache(Se);
});
E.prototype.on.call(E.prototype, 'listeningChange.konva', function () {
	this._clearSelfAndDescendantCache(ye);
});
E.prototype.on.call(E.prototype, 'opacityChange.konva', function () {
	this._clearSelfAndDescendantCache(se);
});
const U = u.addGetterSetter;
U(E, 'zIndex');
U(E, 'absolutePosition');
U(E, 'position');
U(E, 'x', 0, P());
U(E, 'y', 0, P());
U(E, 'globalCompositeOperation', 'source-over', bt());
U(E, 'opacity', 1, P());
U(E, 'name', '', bt());
U(E, 'id', '', bt());
U(E, 'rotation', 0, P());
u.addComponentsGetterSetter(E, 'scale', ['x', 'y']);
U(E, 'scaleX', 1, P());
U(E, 'scaleY', 1, P());
u.addComponentsGetterSetter(E, 'skew', ['x', 'y']);
U(E, 'skewX', 0, P());
U(E, 'skewY', 0, P());
u.addComponentsGetterSetter(E, 'offset', ['x', 'y']);
U(E, 'offsetX', 0, P());
U(E, 'offsetY', 0, P());
U(E, 'dragDistance', void 0, P());
U(E, 'width', 0, P());
U(E, 'height', 0, P());
U(E, 'listening', !0, st());
U(E, 'preventDefault', !0, st());
U(E, 'filters', void 0, function (s) {
	return ((this._filterUpToDate = !1), s);
});
U(E, 'visible', !0, st());
U(E, 'transformsEnabled', 'all', bt());
U(E, 'size');
U(E, 'dragBoundFunc');
U(E, 'draggable', !1, st());
u.backCompat(E, { rotateDeg: 'rotate', setRotationDeg: 'setRotation', getRotationDeg: 'getRotation' });
class et extends E {
	constructor() {
		(super(...arguments), (this.children = []));
	}
	getChildren(t) {
		const e = this.children || [];
		return t ? e.filter(t) : e;
	}
	hasChildren() {
		return this.getChildren().length > 0;
	}
	removeChildren() {
		return (
			this.getChildren().forEach((t) => {
				((t.parent = null), (t.index = 0), t.remove());
			}),
			(this.children = []),
			this._requestDraw(),
			this
		);
	}
	destroyChildren() {
		return (
			this.getChildren().forEach((t) => {
				((t.parent = null), (t.index = 0), t.destroy());
			}),
			(this.children = []),
			this._requestDraw(),
			this
		);
	}
	add(...t) {
		if (t.length === 0) return this;
		if (t.length > 1) {
			for (let i = 0; i < t.length; i++) this.add(t[i]);
			return this;
		}
		const e = t[0];
		return e.getParent()
			? (e.moveTo(this), this)
			: (this._validateAdd(e),
				(e.index = this.getChildren().length),
				(e.parent = this),
				e._clearCaches(),
				this.getChildren().push(e),
				this._fire('add', { child: e }),
				this._requestDraw(),
				this);
	}
	destroy() {
		return (this.hasChildren() && this.destroyChildren(), super.destroy(), this);
	}
	find(t) {
		return this._generalFind(t, !1);
	}
	findOne(t) {
		const e = this._generalFind(t, !0);
		return e.length > 0 ? e[0] : void 0;
	}
	_generalFind(t, e) {
		const i = [];
		return (
			this._descendants((n) => {
				const r = n._isMatch(t);
				return (r && i.push(n), !!(r && e));
			}),
			i
		);
	}
	_descendants(t) {
		let e = !1;
		const i = this.getChildren();
		for (const n of i) {
			if (((e = t(n)), e)) return !0;
			if (n.hasChildren() && ((e = n._descendants(t)), e)) return !0;
		}
		return !1;
	}
	toObject() {
		const t = E.prototype.toObject.call(this);
		return (
			(t.children = []),
			this.getChildren().forEach((e) => {
				t.children.push(e.toObject());
			}),
			t
		);
	}
	isAncestorOf(t) {
		let e = t.getParent();
		for (; e; ) {
			if (e._id === this._id) return !0;
			e = e.getParent();
		}
		return !1;
	}
	clone(t) {
		const e = E.prototype.clone.call(this, t);
		return (
			this.getChildren().forEach(function (i) {
				e.add(i.clone());
			}),
			e
		);
	}
	getAllIntersections(t) {
		const e = [];
		return (
			this.find('Shape').forEach((i) => {
				i.isVisible() && i.intersects(t) && e.push(i);
			}),
			e
		);
	}
	_clearSelfAndDescendantCache(t) {
		var e;
		(super._clearSelfAndDescendantCache(t),
			!this.isCached() &&
				((e = this.children) === null ||
					e === void 0 ||
					e.forEach(function (i) {
						i._clearSelfAndDescendantCache(t);
					})));
	}
	_setChildrenIndices() {
		var t;
		((t = this.children) === null ||
			t === void 0 ||
			t.forEach(function (e, i) {
				e.index = i;
			}),
			this._requestDraw());
	}
	drawScene(t, e, i) {
		const n = this.getLayer(),
			r = t || (n && n.getCanvas()),
			a = r && r.getContext(),
			o = this._getCanvasCache(),
			h = o && o.scene,
			l = r && r.isCache;
		if (!this.isVisible() && !l) return this;
		if (h) {
			a.save();
			const c = this.getAbsoluteTransform(e).getMatrix();
			(a.transform(c[0], c[1], c[2], c[3], c[4], c[5]), this._drawCachedSceneCanvas(a), a.restore());
		} else this._drawChildren('drawScene', r, e, i);
		return this;
	}
	drawHit(t, e) {
		if (!this.shouldDrawHit(e)) return this;
		const i = this.getLayer(),
			n = t || (i && i.hitCanvas),
			r = n && n.getContext(),
			a = this._getCanvasCache();
		if (a && a.hit) {
			r.save();
			const h = this.getAbsoluteTransform(e).getMatrix();
			(r.transform(h[0], h[1], h[2], h[3], h[4], h[5]), this._drawCachedHitCanvas(r), r.restore());
		} else this._drawChildren('drawHit', n, e);
		return this;
	}
	_drawChildren(t, e, i, n) {
		var r;
		const a = e && e.getContext(),
			o = this.clipWidth(),
			h = this.clipHeight(),
			l = this.clipFunc(),
			c = (typeof o == 'number' && typeof h == 'number') || l,
			f = i === this;
		if (c) {
			a.save();
			const p = this.getAbsoluteTransform(i);
			let g = p.getMatrix();
			(a.transform(g[0], g[1], g[2], g[3], g[4], g[5]), a.beginPath());
			let _;
			if (l) _ = l.call(this, a, this);
			else {
				const b = this.clipX(),
					y = this.clipY();
				a.rect(b || 0, y || 0, o, h);
			}
			(a.clip.apply(a, _), (g = p.copy().invert().getMatrix()), a.transform(g[0], g[1], g[2], g[3], g[4], g[5]));
		}
		const d = !f && this.globalCompositeOperation() !== 'source-over' && t === 'drawScene';
		(d && (a.save(), a._applyGlobalCompositeOperation(this)),
			(r = this.children) === null ||
				r === void 0 ||
				r.forEach(function (p) {
					p[t](e, i, n);
				}),
			d && a.restore(),
			c && a.restore());
	}
	getClientRect(t = {}) {
		var e;
		const i = t.skipTransform,
			n = t.relativeTo;
		let r,
			a,
			o,
			h,
			l = { x: 1 / 0, y: 1 / 0, width: 0, height: 0 };
		const c = this;
		(e = this.children) === null ||
			e === void 0 ||
			e.forEach(function (p) {
				if (!p.visible()) return;
				const g = p.getClientRect({ relativeTo: c, skipShadow: t.skipShadow, skipStroke: t.skipStroke });
				(g.width === 0 && g.height === 0) ||
					(r === void 0
						? ((r = g.x), (a = g.y), (o = g.x + g.width), (h = g.y + g.height))
						: ((r = Math.min(r, g.x)), (a = Math.min(a, g.y)), (o = Math.max(o, g.x + g.width)), (h = Math.max(h, g.y + g.height))));
			});
		const f = this.find('Shape');
		let d = !1;
		for (let p = 0; p < f.length; p++)
			if (f[p]._isVisible(this)) {
				d = !0;
				break;
			}
		return (
			d && r !== void 0 ? (l = { x: r, y: a, width: o - r, height: h - a }) : (l = { x: 0, y: 0, width: 0, height: 0 }),
			i ? l : this._transformedRect(l, n)
		);
	}
}
u.addComponentsGetterSetter(et, 'clip', ['x', 'y', 'width', 'height']);
u.addGetterSetter(et, 'clipX', void 0, P());
u.addGetterSetter(et, 'clipY', void 0, P());
u.addGetterSetter(et, 'clipWidth', void 0, P());
u.addGetterSetter(et, 'clipHeight', void 0, P());
u.addGetterSetter(et, 'clipFunc');
const Vt = new Map(),
	ci = A._global.PointerEvent !== void 0;
function de(s) {
	return Vt.get(s);
}
function Ge(s) {
	return { evt: s, pointerId: s.pointerId };
}
function di(s, t) {
	return Vt.get(s) === t;
}
function fi(s, t) {
	(zt(s), t.getStage() && (Vt.set(s, t), ci && t._fire('gotpointercapture', Ge(new PointerEvent('gotpointercapture')))));
}
function zt(s, t) {
	const e = Vt.get(s);
	if (!e) return;
	const i = e.getStage();
	(i && i.content, Vt.delete(s), ci && e._fire('lostpointercapture', Ge(new PointerEvent('lostpointercapture'))));
}
const Mn = 'Stage',
	Gn = 'string',
	Ue = 'px',
	On = 'mouseout',
	ui = 'mouseleave',
	gi = 'mouseover',
	pi = 'mouseenter',
	mi = 'mousemove',
	_i = 'mousedown',
	yi = 'mouseup',
	Nt = 'pointermove',
	Ft = 'pointerdown',
	Pt = 'pointerup',
	Bt = 'pointercancel',
	Ln = 'lostpointercapture',
	Qt = 'pointerout',
	Ht = 'pointerleave',
	Jt = 'pointerover',
	Zt = 'pointerenter',
	be = 'contextmenu',
	Si = 'touchstart',
	bi = 'touchend',
	vi = 'touchmove',
	Ci = 'touchcancel',
	ve = 'wheel',
	In = 5,
	Dn = [
		[pi, '_pointerenter'],
		[_i, '_pointerdown'],
		[mi, '_pointermove'],
		[yi, '_pointerup'],
		[ui, '_pointerleave'],
		[Si, '_pointerdown'],
		[vi, '_pointermove'],
		[bi, '_pointerup'],
		[Ci, '_pointercancel'],
		[gi, '_pointerover'],
		[ve, '_wheel'],
		[be, '_contextmenu'],
		[Ft, '_pointerdown'],
		[Nt, '_pointermove'],
		[Pt, '_pointerup'],
		[Bt, '_pointercancel'],
		[Ht, '_pointerleave'],
		[Ln, '_lostpointercapture']
	],
	fe = {
		mouse: {
			[Qt]: On,
			[Ht]: ui,
			[Jt]: gi,
			[Zt]: pi,
			[Nt]: mi,
			[Ft]: _i,
			[Pt]: yi,
			[Bt]: 'mousecancel',
			pointerclick: 'click',
			pointerdblclick: 'dblclick'
		},
		touch: {
			[Qt]: 'touchout',
			[Ht]: 'touchleave',
			[Jt]: 'touchover',
			[Zt]: 'touchenter',
			[Nt]: vi,
			[Ft]: Si,
			[Pt]: bi,
			[Bt]: Ci,
			pointerclick: 'tap',
			pointerdblclick: 'dbltap'
		},
		pointer: {
			[Qt]: Qt,
			[Ht]: Ht,
			[Jt]: Jt,
			[Zt]: Zt,
			[Nt]: Nt,
			[Ft]: Ft,
			[Pt]: Pt,
			[Bt]: Bt,
			pointerclick: 'pointerclick',
			pointerdblclick: 'pointerdblclick'
		}
	},
	Wt = (s) => (s.indexOf('pointer') >= 0 ? 'pointer' : s.indexOf('touch') >= 0 ? 'touch' : 'mouse'),
	Tt = (s) => {
		const t = Wt(s);
		if (t === 'pointer') return A.pointerEventsEnabled && fe.pointer;
		if (t === 'touch') return fe.touch;
		if (t === 'mouse') return fe.mouse;
	};
function Ve(s = {}) {
	return ((s.clipFunc || s.clipWidth || s.clipHeight) && m.warn('Stage does not support clipping. Please use clip for Layers or Groups.'), s);
}
const Nn =
		'Pointer position is missing and not registered by the stage. Looks like it is outside of the stage container. You can set it manually from event: stage.setPointersPositions(event);',
	Yt = [];
class le extends et {
	constructor(t) {
		(super(Ve(t)),
			(this._pointerPositions = []),
			(this._changedPointerPositions = []),
			this._buildDOM(),
			this._bindContentEvents(),
			Yt.push(this),
			this.on('widthChange.konva heightChange.konva', this._resizeDOM),
			this.on('visibleChange.konva', this._checkVisibility),
			this.on('clipWidthChange.konva clipHeightChange.konva clipFuncChange.konva', () => {
				Ve(this.attrs);
			}),
			this._checkVisibility());
	}
	_validateAdd(t) {
		const e = t.getType() === 'Layer',
			i = t.getType() === 'FastLayer';
		e || i || m.throw('You may only add layers to the stage.');
	}
	_checkVisibility() {
		if (!this.content) return;
		const t = this.visible() ? '' : 'none';
		this.content.style.display = t;
	}
	setContainer(t) {
		if (typeof t === Gn) {
			let e;
			if (t.charAt(0) === '.') {
				const i = t.slice(1);
				t = document.getElementsByClassName(i)[0];
			} else (t.charAt(0) !== '#' ? (e = t) : (e = t.slice(1)), (t = document.getElementById(e)));
			if (!t) throw 'Can not find container in document with id ' + e;
		}
		return (
			this._setAttr('container', t),
			this.content && (this.content.parentElement && this.content.parentElement.removeChild(this.content), t.appendChild(this.content)),
			this
		);
	}
	shouldDrawHit() {
		return !0;
	}
	clear() {
		const t = this.children,
			e = t.length;
		for (let i = 0; i < e; i++) t[i].clear();
		return this;
	}
	clone(t) {
		return (t || (t = {}), (t.container = typeof document < 'u' && document.createElement('div')), et.prototype.clone.call(this, t));
	}
	destroy() {
		super.destroy();
		const t = this.content;
		t && m._isInDocument(t) && this.container().removeChild(t);
		const e = Yt.indexOf(this);
		return (e > -1 && Yt.splice(e, 1), m.releaseCanvas(this.bufferCanvas._canvas, this.bufferHitCanvas._canvas), this);
	}
	getPointerPosition() {
		const t = this._pointerPositions[0] || this._changedPointerPositions[0];
		return t ? { x: t.x, y: t.y } : (m.warn(Nn), null);
	}
	_getPointerById(t) {
		return this._pointerPositions.find((e) => e.id === t);
	}
	getPointersPositions() {
		return this._pointerPositions;
	}
	getStage() {
		return this;
	}
	getContent() {
		return this.content;
	}
	_toKonvaCanvas(t) {
		((t = { ...t }), (t.x = t.x || 0), (t.y = t.y || 0), (t.width = t.width || this.width()), (t.height = t.height || this.height()));
		const e = new ft({ width: t.width, height: t.height, pixelRatio: t.pixelRatio || 1 }),
			i = e.getContext()._context,
			n = this.children;
		return (
			(t.x || t.y) && i.translate(-1 * t.x, -1 * t.y),
			n.forEach(function (r) {
				if (!r.isVisible()) return;
				const a = r._toKonvaCanvas(t);
				i.drawImage(a._canvas, t.x, t.y, a.getWidth() / a.getPixelRatio(), a.getHeight() / a.getPixelRatio());
			}),
			e
		);
	}
	getIntersection(t) {
		if (!t) return null;
		const e = this.children,
			i = e.length,
			n = i - 1;
		for (let r = n; r >= 0; r--) {
			const a = e[r].getIntersection(t);
			if (a) return a;
		}
		return null;
	}
	_resizeDOM() {
		const t = this.width(),
			e = this.height();
		(this.content && ((this.content.style.width = t + Ue), (this.content.style.height = e + Ue)),
			this.bufferCanvas.setSize(t, e),
			this.bufferHitCanvas.setSize(t, e),
			this.children.forEach((i) => {
				(i.setSize({ width: t, height: e }), i.draw());
			}));
	}
	add(t, ...e) {
		if (arguments.length > 1) {
			for (let n = 0; n < arguments.length; n++) this.add(arguments[n]);
			return this;
		}
		super.add(t);
		const i = this.children.length;
		return (
			i > In &&
				m.warn(
					'The stage has ' +
						i +
						' layers. Recommended maximum number of layers is 3-5. Adding more layers into the stage may drop the performance. Rethink your tree structure, you can use Konva.Group.'
				),
			t.setSize({ width: this.width(), height: this.height() }),
			t.draw(),
			A.isBrowser && this.content.appendChild(t.canvas._canvas),
			this
		);
	}
	getParent() {
		return null;
	}
	getLayer() {
		return null;
	}
	hasPointerCapture(t) {
		return di(t, this);
	}
	setPointerCapture(t) {
		fi(t, this);
	}
	releaseCapture(t) {
		zt(t);
	}
	getLayers() {
		return this.children;
	}
	_bindContentEvents() {
		A.isBrowser &&
			Dn.forEach(([t, e]) => {
				this.content.addEventListener(
					t,
					(i) => {
						this[e](i);
					},
					{ passive: !1 }
				);
			});
	}
	_pointerenter(t) {
		this.setPointersPositions(t);
		const e = Tt(t.type);
		e && this._fire(e.pointerenter, { evt: t, target: this, currentTarget: this });
	}
	_pointerover(t) {
		this.setPointersPositions(t);
		const e = Tt(t.type);
		e && this._fire(e.pointerover, { evt: t, target: this, currentTarget: this });
	}
	_getTargetShape(t) {
		let e = this[t + 'targetShape'];
		return (e && !e.getStage() && (e = null), e);
	}
	_pointerleave(t) {
		const e = Tt(t.type),
			i = Wt(t.type);
		if (!e) return;
		this.setPointersPositions(t);
		const n = this._getTargetShape(i),
			r = !(A.isDragging() || A.isTransforming()) || A.hitOnDragEnabled;
		(n && r
			? (n._fireAndBubble(e.pointerout, { evt: t }),
				n._fireAndBubble(e.pointerleave, { evt: t }),
				this._fire(e.pointerleave, { evt: t, target: this, currentTarget: this }),
				(this[i + 'targetShape'] = null))
			: r &&
				(this._fire(e.pointerleave, { evt: t, target: this, currentTarget: this }),
				this._fire(e.pointerout, { evt: t, target: this, currentTarget: this })),
			(this.pointerPos = null),
			(this._pointerPositions = []));
	}
	_pointerdown(t) {
		const e = Tt(t.type),
			i = Wt(t.type);
		if (!e) return;
		this.setPointersPositions(t);
		let n = !1;
		(this._changedPointerPositions.forEach((r) => {
			const a = this.getIntersection(r);
			if (((z.justDragged = !1), (A['_' + i + 'ListenClick'] = !0), !a || !a.isListening())) {
				this[i + 'ClickStartShape'] = void 0;
				return;
			}
			(A.capturePointerEventsEnabled && a.setPointerCapture(r.id),
				(this[i + 'ClickStartShape'] = a),
				a._fireAndBubble(e.pointerdown, { evt: t, pointerId: r.id }),
				(n = !0));
			const o = t.type.indexOf('touch') >= 0;
			a.preventDefault() && t.cancelable && o && t.preventDefault();
		}),
			n || this._fire(e.pointerdown, { evt: t, target: this, currentTarget: this, pointerId: this._pointerPositions[0].id }));
	}
	_pointermove(t) {
		const e = Tt(t.type),
			i = Wt(t.type);
		if (!e) return;
		const n = t.type.indexOf('touch') >= 0 || t.pointerType === 'touch';
		if (
			(A.isDragging() && z.node.preventDefault() && t.cancelable && n && t.preventDefault(),
			this.setPointersPositions(t),
			!(!(A.isDragging() || A.isTransforming()) || A.hitOnDragEnabled))
		)
			return;
		const a = {};
		let o = !1;
		const h = this._getTargetShape(i);
		(this._changedPointerPositions.forEach((l) => {
			const c = de(l.id) || this.getIntersection(l),
				f = l.id,
				d = { evt: t, pointerId: f },
				p = h !== c;
			if ((p && h && (h._fireAndBubble(e.pointerout, { ...d }, c), h._fireAndBubble(e.pointerleave, { ...d }, c)), c)) {
				if (a[c._id]) return;
				a[c._id] = !0;
			}
			c && c.isListening()
				? ((o = !0),
					p && (c._fireAndBubble(e.pointerover, { ...d }, h), c._fireAndBubble(e.pointerenter, { ...d }, h), (this[i + 'targetShape'] = c)),
					c._fireAndBubble(e.pointermove, { ...d }))
				: h && (this._fire(e.pointerover, { evt: t, target: this, currentTarget: this, pointerId: f }), (this[i + 'targetShape'] = null));
		}),
			o || this._fire(e.pointermove, { evt: t, target: this, currentTarget: this, pointerId: this._changedPointerPositions[0].id }));
	}
	_pointerup(t) {
		const e = Tt(t.type),
			i = Wt(t.type);
		if (!e) return;
		this.setPointersPositions(t);
		const n = this[i + 'ClickStartShape'],
			r = this[i + 'ClickEndShape'],
			a = {};
		let o = !1;
		(this._changedPointerPositions.forEach((h) => {
			const l = de(h.id) || this.getIntersection(h);
			if (l) {
				if ((l.releaseCapture(h.id), a[l._id])) return;
				a[l._id] = !0;
			}
			const c = h.id,
				f = { evt: t, pointerId: c };
			let d = !1;
			(A['_' + i + 'InDblClickWindow']
				? ((d = !0), clearTimeout(this[i + 'DblTimeout']))
				: z.justDragged || ((A['_' + i + 'InDblClickWindow'] = !0), clearTimeout(this[i + 'DblTimeout'])),
				(this[i + 'DblTimeout'] = setTimeout(function () {
					A['_' + i + 'InDblClickWindow'] = !1;
				}, A.dblClickWindow)),
				l && l.isListening()
					? ((o = !0),
						(this[i + 'ClickEndShape'] = l),
						l._fireAndBubble(e.pointerup, { ...f }),
						A['_' + i + 'ListenClick'] &&
							n &&
							n === l &&
							(l._fireAndBubble(e.pointerclick, { ...f }), d && r && r === l && l._fireAndBubble(e.pointerdblclick, { ...f })))
					: ((this[i + 'ClickEndShape'] = null),
						o || (this._fire(e.pointerup, { evt: t, target: this, currentTarget: this, pointerId: this._changedPointerPositions[0].id }), (o = !0)),
						A['_' + i + 'ListenClick'] && this._fire(e.pointerclick, { evt: t, target: this, currentTarget: this, pointerId: c }),
						d && this._fire(e.pointerdblclick, { evt: t, target: this, currentTarget: this, pointerId: c })));
		}),
			o || this._fire(e.pointerup, { evt: t, target: this, currentTarget: this, pointerId: this._changedPointerPositions[0].id }),
			(A['_' + i + 'ListenClick'] = !1),
			t.cancelable && i !== 'touch' && i !== 'pointer' && t.preventDefault());
	}
	_contextmenu(t) {
		this.setPointersPositions(t);
		const e = this.getIntersection(this.getPointerPosition());
		e && e.isListening() ? e._fireAndBubble(be, { evt: t }) : this._fire(be, { evt: t, target: this, currentTarget: this });
	}
	_wheel(t) {
		this.setPointersPositions(t);
		const e = this.getIntersection(this.getPointerPosition());
		e && e.isListening() ? e._fireAndBubble(ve, { evt: t }) : this._fire(ve, { evt: t, target: this, currentTarget: this });
	}
	_pointercancel(t) {
		this.setPointersPositions(t);
		const e = de(t.pointerId) || this.getIntersection(this.getPointerPosition());
		(e && e._fireAndBubble(Pt, Ge(t)), zt(t.pointerId));
	}
	_lostpointercapture(t) {
		zt(t.pointerId);
	}
	setPointersPositions(t) {
		const e = this._getContentPosition();
		let i = null,
			n = null;
		((t = t || window.event),
			t.touches !== void 0
				? ((this._pointerPositions = []),
					(this._changedPointerPositions = []),
					Array.prototype.forEach.call(t.touches, (r) => {
						this._pointerPositions.push({ id: r.identifier, x: (r.clientX - e.left) / e.scaleX, y: (r.clientY - e.top) / e.scaleY });
					}),
					Array.prototype.forEach.call(t.changedTouches || t.touches, (r) => {
						this._changedPointerPositions.push({ id: r.identifier, x: (r.clientX - e.left) / e.scaleX, y: (r.clientY - e.top) / e.scaleY });
					}))
				: ((i = (t.clientX - e.left) / e.scaleX),
					(n = (t.clientY - e.top) / e.scaleY),
					(this.pointerPos = { x: i, y: n }),
					(this._pointerPositions = [{ x: i, y: n, id: m._getFirstPointerId(t) }]),
					(this._changedPointerPositions = [{ x: i, y: n, id: m._getFirstPointerId(t) }])));
	}
	_setPointerPosition(t) {
		(m.warn('Method _setPointerPosition is deprecated. Use "stage.setPointersPositions(event)" instead.'), this.setPointersPositions(t));
	}
	_getContentPosition() {
		if (!this.content || !this.content.getBoundingClientRect) return { top: 0, left: 0, scaleX: 1, scaleY: 1 };
		const t = this.content.getBoundingClientRect();
		return { top: t.top, left: t.left, scaleX: t.width / this.content.clientWidth || 1, scaleY: t.height / this.content.clientHeight || 1 };
	}
	_buildDOM() {
		if (
			((this.bufferCanvas = new ft({ width: this.width(), height: this.height() })),
			(this.bufferHitCanvas = new Re({ pixelRatio: 1, width: this.width(), height: this.height() })),
			!A.isBrowser)
		)
			return;
		const t = this.container();
		if (!t) throw 'Stage has no container. A container is required.';
		((t.innerHTML = ''),
			(this.content = document.createElement('div')),
			(this.content.style.position = 'relative'),
			(this.content.style.userSelect = 'none'),
			(this.content.className = 'konvajs-content'),
			this.content.setAttribute('role', 'presentation'),
			t.appendChild(this.content),
			this._resizeDOM());
	}
	cache() {
		return (m.warn('Cache function is not allowed for stage. You may use cache only for layers, groups and shapes.'), this);
	}
	clearCache() {
		return this;
	}
	batchDraw() {
		return (
			this.getChildren().forEach(function (t) {
				t.batchDraw();
			}),
			this
		);
	}
}
le.prototype.nodeType = Mn;
K(le);
u.addGetterSetter(le, 'container');
A.isBrowser &&
	document.addEventListener('visibilitychange', () => {
		Yt.forEach((s) => {
			s.batchDraw();
		});
	});
const xi = 'hasShadow',
	wi = 'shadowRGBA',
	Ti = 'patternImage',
	Ei = 'linearGradient',
	Pi = 'radialGradient';
let te;
function ue() {
	return te || ((te = m.createCanvasElement().getContext('2d')), te);
}
const Xt = {};
function Fn(s) {
	const t = this.attrs.fillRule;
	t ? s.fill(t) : s.fill();
}
function Bn(s) {
	s.stroke();
}
function Hn(s) {
	const t = this.attrs.fillRule;
	t ? s.fill(t) : s.fill();
}
function Wn(s) {
	s.stroke();
}
function zn() {
	this._clearCache(xi);
}
function Yn() {
	this._clearCache(wi);
}
function Xn() {
	this._clearCache(Ti);
}
function Un() {
	this._clearCache(Ei);
}
function Vn() {
	this._clearCache(Pi);
}
class x extends E {
	constructor(t) {
		super(t);
		let e,
			i = 0;
		for (; (e = m.getHitColor()), !(e && !(e in Xt)); )
			if ((i++, i >= 1e4)) {
				(m.warn(
					'Failed to find a unique color key for a shape. Konva may work incorrectly. Most likely your browser is using canvas farbling. Consider disabling it.'
				),
					(e = m.getRandomColor()));
				break;
			}
		((this.colorKey = e), (Xt[e] = this));
	}
	getContext() {
		return (m.warn('shape.getContext() method is deprecated. Please do not use it.'), this.getLayer().getContext());
	}
	getCanvas() {
		return (m.warn('shape.getCanvas() method is deprecated. Please do not use it.'), this.getLayer().getCanvas());
	}
	getSceneFunc() {
		return this.attrs.sceneFunc || this._sceneFunc;
	}
	getHitFunc() {
		return this.attrs.hitFunc || this._hitFunc;
	}
	hasShadow() {
		return this._getCache(xi, this._hasShadow);
	}
	_hasShadow() {
		return (
			this.shadowEnabled() &&
			this.shadowOpacity() !== 0 &&
			!!(this.shadowColor() || this.shadowBlur() || this.shadowOffsetX() || this.shadowOffsetY())
		);
	}
	_getFillPattern() {
		return this._getCache(Ti, this.__getFillPattern);
	}
	__getFillPattern() {
		if (this.fillPatternImage()) {
			const e = ue().createPattern(this.fillPatternImage(), this.fillPatternRepeat() || 'repeat');
			if (e && e.setTransform) {
				const i = new tt();
				(i.translate(this.fillPatternX(), this.fillPatternY()),
					i.rotate(A.getAngle(this.fillPatternRotation())),
					i.scale(this.fillPatternScaleX(), this.fillPatternScaleY()),
					i.translate(-1 * this.fillPatternOffsetX(), -1 * this.fillPatternOffsetY()));
				const n = i.getMatrix(),
					r = typeof DOMMatrix > 'u' ? { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] } : new DOMMatrix(n);
				e.setTransform(r);
			}
			return e;
		}
	}
	_getLinearGradient() {
		return this._getCache(Ei, this.__getLinearGradient);
	}
	__getLinearGradient() {
		const t = this.fillLinearGradientColorStops();
		if (t) {
			const e = ue(),
				i = this.fillLinearGradientStartPoint(),
				n = this.fillLinearGradientEndPoint(),
				r = e.createLinearGradient(i.x, i.y, n.x, n.y);
			for (let a = 0; a < t.length; a += 2) r.addColorStop(t[a], t[a + 1]);
			return r;
		}
	}
	_getRadialGradient() {
		return this._getCache(Pi, this.__getRadialGradient);
	}
	__getRadialGradient() {
		const t = this.fillRadialGradientColorStops();
		if (t) {
			const e = ue(),
				i = this.fillRadialGradientStartPoint(),
				n = this.fillRadialGradientEndPoint(),
				r = e.createRadialGradient(i.x, i.y, this.fillRadialGradientStartRadius(), n.x, n.y, this.fillRadialGradientEndRadius());
			for (let a = 0; a < t.length; a += 2) r.addColorStop(t[a], t[a + 1]);
			return r;
		}
	}
	getShadowRGBA() {
		return this._getCache(wi, this._getShadowRGBA);
	}
	_getShadowRGBA() {
		if (!this.hasShadow()) return;
		const t = m.colorToRGBA(this.shadowColor());
		if (t) return 'rgba(' + t.r + ',' + t.g + ',' + t.b + ',' + t.a * (this.shadowOpacity() || 1) + ')';
	}
	hasFill() {
		return this._calculate(
			'hasFill',
			['fillEnabled', 'fill', 'fillPatternImage', 'fillLinearGradientColorStops', 'fillRadialGradientColorStops'],
			() =>
				this.fillEnabled() && !!(this.fill() || this.fillPatternImage() || this.fillLinearGradientColorStops() || this.fillRadialGradientColorStops())
		);
	}
	hasStroke() {
		return this._calculate(
			'hasStroke',
			['strokeEnabled', 'strokeWidth', 'stroke', 'strokeLinearGradientColorStops'],
			() => this.strokeEnabled() && this.strokeWidth() && !!(this.stroke() || this.strokeLinearGradientColorStops())
		);
	}
	hasHitStroke() {
		const t = this.hitStrokeWidth();
		return t === 'auto' ? this.hasStroke() : this.strokeEnabled() && !!t;
	}
	intersects(t) {
		const e = this.getStage();
		if (!e) return !1;
		const i = e.bufferHitCanvas;
		return (i.getContext().clear(), this.drawHit(i, void 0, !0), i.context.getImageData(Math.round(t.x), Math.round(t.y), 1, 1).data[3] > 0);
	}
	destroy() {
		return (E.prototype.destroy.call(this), delete Xt[this.colorKey], delete this.colorKey, this);
	}
	_useBufferCanvas(t) {
		var e;
		if (!((e = this.attrs.perfectDrawEnabled) !== null && e !== void 0 ? e : !0)) return !1;
		const n = t || this.hasFill(),
			r = this.hasStroke(),
			a = this.getAbsoluteOpacity() !== 1;
		if (n && r && a) return !0;
		const o = this.hasShadow(),
			h = this.shadowForStrokeEnabled();
		return !!(n && r && o && h);
	}
	setStrokeHitEnabled(t) {
		(m.warn('strokeHitEnabled property is deprecated. Please use hitStrokeWidth instead.'), t ? this.hitStrokeWidth('auto') : this.hitStrokeWidth(0));
	}
	getStrokeHitEnabled() {
		return this.hitStrokeWidth() !== 0;
	}
	getSelfRect() {
		const t = this.size();
		return { x: this._centroid ? -t.width / 2 : 0, y: this._centroid ? -t.height / 2 : 0, width: t.width, height: t.height };
	}
	getClientRect(t = {}) {
		let e = !1,
			i = this.getParent();
		for (; i; ) {
			if (i.isCached()) {
				e = !0;
				break;
			}
			i = i.getParent();
		}
		const n = t.skipTransform,
			r = t.relativeTo || (e && this.getStage()) || void 0,
			a = this.getSelfRect(),
			h = (!t.skipStroke && this.hasStroke() && this.strokeWidth()) || 0,
			l = a.width + h,
			c = a.height + h,
			f = !t.skipShadow && this.hasShadow(),
			d = f ? this.shadowOffsetX() : 0,
			p = f ? this.shadowOffsetY() : 0,
			g = l + Math.abs(d),
			_ = c + Math.abs(p),
			b = (f && this.shadowBlur()) || 0,
			y = g + b * 2,
			S = _ + b * 2,
			C = { width: y, height: S, x: -(h / 2 + b) + Math.min(d, 0) + a.x, y: -(h / 2 + b) + Math.min(p, 0) + a.y };
		return n ? C : this._transformedRect(C, r);
	}
	drawScene(t, e, i) {
		const n = this.getLayer(),
			r = t || n.getCanvas(),
			a = r.getContext(),
			o = this._getCanvasCache(),
			h = this.getSceneFunc(),
			l = this.hasShadow();
		let c;
		const f = e === this;
		if (!this.isVisible() && !f) return this;
		if (o) {
			a.save();
			const d = this.getAbsoluteTransform(e).getMatrix();
			return (a.transform(d[0], d[1], d[2], d[3], d[4], d[5]), this._drawCachedSceneCanvas(a), a.restore(), this);
		}
		if (!h) return this;
		if ((a.save(), this._useBufferCanvas())) {
			c = this.getStage();
			const d = i || c.bufferCanvas,
				p = d.getContext();
			(i ? (p.save(), p.setTransform(1, 0, 0, 1, 0, 0), p.clearRect(0, 0, d.width, d.height), p.restore()) : p.clear(),
				p.save(),
				p._applyLineJoin(this),
				p._applyMiterLimit(this));
			const g = this.getAbsoluteTransform(e).getMatrix();
			(p.transform(g[0], g[1], g[2], g[3], g[4], g[5]), h.call(this, p, this), p.restore());
			const _ = d.pixelRatio;
			(l && a._applyShadow(this),
				f || (a._applyOpacity(this), a._applyGlobalCompositeOperation(this)),
				a.drawImage(d._canvas, d.x || 0, d.y || 0, d.width / _, d.height / _));
		} else {
			if ((a._applyLineJoin(this), a._applyMiterLimit(this), !f)) {
				const d = this.getAbsoluteTransform(e).getMatrix();
				(a.transform(d[0], d[1], d[2], d[3], d[4], d[5]), a._applyOpacity(this), a._applyGlobalCompositeOperation(this));
			}
			(l && a._applyShadow(this), h.call(this, a, this));
		}
		return (a.restore(), this);
	}
	drawHit(t, e, i = !1) {
		if (!this.shouldDrawHit(e, i)) return this;
		const n = this.getLayer(),
			r = t || n.hitCanvas,
			a = r && r.getContext(),
			o = this.hitFunc() || this.sceneFunc(),
			h = this._getCanvasCache(),
			l = h && h.hit;
		if (
			(this.colorKey ||
				m.warn(
					'Looks like your canvas has a destroyed shape in it. Do not reuse shape after you destroyed it. If you want to reuse shape you should call remove() instead of destroy()'
				),
			l)
		) {
			a.save();
			const f = this.getAbsoluteTransform(e).getMatrix();
			return (a.transform(f[0], f[1], f[2], f[3], f[4], f[5]), this._drawCachedHitCanvas(a), a.restore(), this);
		}
		if (!o) return this;
		if ((a.save(), a._applyLineJoin(this), a._applyMiterLimit(this), !(this === e))) {
			const f = this.getAbsoluteTransform(e).getMatrix();
			a.transform(f[0], f[1], f[2], f[3], f[4], f[5]);
		}
		return (o.call(this, a, this), a.restore(), this);
	}
	drawHitFromCache(t = 0) {
		const e = this._getCanvasCache(),
			i = this._getCachedSceneCanvas(),
			n = e.hit,
			r = n.getContext(),
			a = n.getWidth(),
			o = n.getHeight();
		(r.clear(), r.drawImage(i._canvas, 0, 0, a, o));
		try {
			const h = r.getImageData(0, 0, a, o),
				l = h.data,
				c = l.length,
				f = m._hexToRgb(this.colorKey);
			for (let d = 0; d < c; d += 4) l[d + 3] > t ? ((l[d] = f.r), (l[d + 1] = f.g), (l[d + 2] = f.b), (l[d + 3] = 255)) : (l[d + 3] = 0);
			r.putImageData(h, 0, 0);
		} catch (h) {
			m.error('Unable to draw hit graph from cached scene canvas. ' + h.message);
		}
		return this;
	}
	hasPointerCapture(t) {
		return di(t, this);
	}
	setPointerCapture(t) {
		fi(t, this);
	}
	releaseCapture(t) {
		zt(t);
	}
}
x.prototype._fillFunc = Fn;
x.prototype._strokeFunc = Bn;
x.prototype._fillFuncHit = Hn;
x.prototype._strokeFuncHit = Wn;
x.prototype._centroid = !1;
x.prototype.nodeType = 'Shape';
K(x);
x.prototype.eventListeners = {};
x.prototype.on.call(
	x.prototype,
	'shadowColorChange.konva shadowBlurChange.konva shadowOffsetChange.konva shadowOpacityChange.konva shadowEnabledChange.konva',
	zn
);
x.prototype.on.call(x.prototype, 'shadowColorChange.konva shadowOpacityChange.konva shadowEnabledChange.konva', Yn);
x.prototype.on.call(
	x.prototype,
	'fillPriorityChange.konva fillPatternImageChange.konva fillPatternRepeatChange.konva fillPatternScaleXChange.konva fillPatternScaleYChange.konva fillPatternOffsetXChange.konva fillPatternOffsetYChange.konva fillPatternXChange.konva fillPatternYChange.konva fillPatternRotationChange.konva',
	Xn
);
x.prototype.on.call(
	x.prototype,
	'fillPriorityChange.konva fillLinearGradientColorStopsChange.konva fillLinearGradientStartPointXChange.konva fillLinearGradientStartPointYChange.konva fillLinearGradientEndPointXChange.konva fillLinearGradientEndPointYChange.konva',
	Un
);
x.prototype.on.call(
	x.prototype,
	'fillPriorityChange.konva fillRadialGradientColorStopsChange.konva fillRadialGradientStartPointXChange.konva fillRadialGradientStartPointYChange.konva fillRadialGradientEndPointXChange.konva fillRadialGradientEndPointYChange.konva fillRadialGradientStartRadiusChange.konva fillRadialGradientEndRadiusChange.konva',
	Vn
);
u.addGetterSetter(x, 'stroke', void 0, li());
u.addGetterSetter(x, 'strokeWidth', 2, P());
u.addGetterSetter(x, 'fillAfterStrokeEnabled', !1);
u.addGetterSetter(x, 'hitStrokeWidth', 'auto', Me());
u.addGetterSetter(x, 'strokeHitEnabled', !0, st());
u.addGetterSetter(x, 'perfectDrawEnabled', !0, st());
u.addGetterSetter(x, 'shadowForStrokeEnabled', !0, st());
u.addGetterSetter(x, 'lineJoin');
u.addGetterSetter(x, 'lineCap');
u.addGetterSetter(x, 'miterLimit');
u.addGetterSetter(x, 'sceneFunc');
u.addGetterSetter(x, 'hitFunc');
u.addGetterSetter(x, 'dash');
u.addGetterSetter(x, 'dashOffset', 0, P());
u.addGetterSetter(x, 'shadowColor', void 0, bt());
u.addGetterSetter(x, 'shadowBlur', 0, P());
u.addGetterSetter(x, 'shadowOpacity', 1, P());
u.addComponentsGetterSetter(x, 'shadowOffset', ['x', 'y']);
u.addGetterSetter(x, 'shadowOffsetX', 0, P());
u.addGetterSetter(x, 'shadowOffsetY', 0, P());
u.addGetterSetter(x, 'fillPatternImage');
u.addGetterSetter(x, 'fill', void 0, li());
u.addGetterSetter(x, 'fillPatternX', 0, P());
u.addGetterSetter(x, 'fillPatternY', 0, P());
u.addGetterSetter(x, 'fillLinearGradientColorStops');
u.addGetterSetter(x, 'strokeLinearGradientColorStops');
u.addGetterSetter(x, 'fillRadialGradientStartRadius', 0);
u.addGetterSetter(x, 'fillRadialGradientEndRadius', 0);
u.addGetterSetter(x, 'fillRadialGradientColorStops');
u.addGetterSetter(x, 'fillPatternRepeat', 'repeat');
u.addGetterSetter(x, 'fillEnabled', !0);
u.addGetterSetter(x, 'strokeEnabled', !0);
u.addGetterSetter(x, 'shadowEnabled', !0);
u.addGetterSetter(x, 'dashEnabled', !0);
u.addGetterSetter(x, 'strokeScaleEnabled', !0);
u.addGetterSetter(x, 'fillPriority', 'color');
u.addComponentsGetterSetter(x, 'fillPatternOffset', ['x', 'y']);
u.addGetterSetter(x, 'fillPatternOffsetX', 0, P());
u.addGetterSetter(x, 'fillPatternOffsetY', 0, P());
u.addComponentsGetterSetter(x, 'fillPatternScale', ['x', 'y']);
u.addGetterSetter(x, 'fillPatternScaleX', 1, P());
u.addGetterSetter(x, 'fillPatternScaleY', 1, P());
u.addComponentsGetterSetter(x, 'fillLinearGradientStartPoint', ['x', 'y']);
u.addComponentsGetterSetter(x, 'strokeLinearGradientStartPoint', ['x', 'y']);
u.addGetterSetter(x, 'fillLinearGradientStartPointX', 0);
u.addGetterSetter(x, 'strokeLinearGradientStartPointX', 0);
u.addGetterSetter(x, 'fillLinearGradientStartPointY', 0);
u.addGetterSetter(x, 'strokeLinearGradientStartPointY', 0);
u.addComponentsGetterSetter(x, 'fillLinearGradientEndPoint', ['x', 'y']);
u.addComponentsGetterSetter(x, 'strokeLinearGradientEndPoint', ['x', 'y']);
u.addGetterSetter(x, 'fillLinearGradientEndPointX', 0);
u.addGetterSetter(x, 'strokeLinearGradientEndPointX', 0);
u.addGetterSetter(x, 'fillLinearGradientEndPointY', 0);
u.addGetterSetter(x, 'strokeLinearGradientEndPointY', 0);
u.addComponentsGetterSetter(x, 'fillRadialGradientStartPoint', ['x', 'y']);
u.addGetterSetter(x, 'fillRadialGradientStartPointX', 0);
u.addGetterSetter(x, 'fillRadialGradientStartPointY', 0);
u.addComponentsGetterSetter(x, 'fillRadialGradientEndPoint', ['x', 'y']);
u.addGetterSetter(x, 'fillRadialGradientEndPointX', 0);
u.addGetterSetter(x, 'fillRadialGradientEndPointY', 0);
u.addGetterSetter(x, 'fillPatternRotation', 0);
u.addGetterSetter(x, 'fillRule', void 0, bt());
u.backCompat(x, {
	dashArray: 'dash',
	getDashArray: 'getDash',
	setDashArray: 'getDash',
	drawFunc: 'sceneFunc',
	getDrawFunc: 'getSceneFunc',
	setDrawFunc: 'setSceneFunc',
	drawHitFunc: 'hitFunc',
	getDrawHitFunc: 'getHitFunc',
	setDrawHitFunc: 'setHitFunc'
});
const qn = 'beforeDraw',
	jn = 'draw',
	ki = [
		{ x: 0, y: 0 },
		{ x: -1, y: -1 },
		{ x: 1, y: -1 },
		{ x: 1, y: 1 },
		{ x: -1, y: 1 }
	],
	Kn = ki.length;
class vt extends et {
	constructor(t) {
		(super(t),
			(this.canvas = new ft()),
			(this.hitCanvas = new Re({ pixelRatio: 1 })),
			(this._waitingForDraw = !1),
			this.on('visibleChange.konva', this._checkVisibility),
			this._checkVisibility(),
			this.on('imageSmoothingEnabledChange.konva', this._setSmoothEnabled),
			this._setSmoothEnabled());
	}
	createPNGStream() {
		return this.canvas._canvas.createPNGStream();
	}
	getCanvas() {
		return this.canvas;
	}
	getNativeCanvasElement() {
		return this.canvas._canvas;
	}
	getHitCanvas() {
		return this.hitCanvas;
	}
	getContext() {
		return this.getCanvas().getContext();
	}
	clear(t) {
		return (this.getContext().clear(t), this.getHitCanvas().getContext().clear(t), this);
	}
	setZIndex(t) {
		super.setZIndex(t);
		const e = this.getStage();
		return (
			e &&
				e.content &&
				(e.content.removeChild(this.getNativeCanvasElement()),
				t < e.children.length - 1
					? e.content.insertBefore(this.getNativeCanvasElement(), e.children[t + 1].getCanvas()._canvas)
					: e.content.appendChild(this.getNativeCanvasElement())),
			this
		);
	}
	moveToTop() {
		E.prototype.moveToTop.call(this);
		const t = this.getStage();
		return (t && t.content && (t.content.removeChild(this.getNativeCanvasElement()), t.content.appendChild(this.getNativeCanvasElement())), !0);
	}
	moveUp() {
		if (!E.prototype.moveUp.call(this)) return !1;
		const e = this.getStage();
		return !e || !e.content
			? !1
			: (e.content.removeChild(this.getNativeCanvasElement()),
				this.index < e.children.length - 1
					? e.content.insertBefore(this.getNativeCanvasElement(), e.children[this.index + 1].getCanvas()._canvas)
					: e.content.appendChild(this.getNativeCanvasElement()),
				!0);
	}
	moveDown() {
		if (E.prototype.moveDown.call(this)) {
			const t = this.getStage();
			if (t) {
				const e = t.children;
				t.content &&
					(t.content.removeChild(this.getNativeCanvasElement()),
					t.content.insertBefore(this.getNativeCanvasElement(), e[this.index + 1].getCanvas()._canvas));
			}
			return !0;
		}
		return !1;
	}
	moveToBottom() {
		if (E.prototype.moveToBottom.call(this)) {
			const t = this.getStage();
			if (t) {
				const e = t.children;
				t.content &&
					(t.content.removeChild(this.getNativeCanvasElement()), t.content.insertBefore(this.getNativeCanvasElement(), e[1].getCanvas()._canvas));
			}
			return !0;
		}
		return !1;
	}
	getLayer() {
		return this;
	}
	remove() {
		const t = this.getNativeCanvasElement();
		return (E.prototype.remove.call(this), t && t.parentNode && m._isInDocument(t) && t.parentNode.removeChild(t), this);
	}
	getStage() {
		return this.parent;
	}
	setSize({ width: t, height: e }) {
		return (this.canvas.setSize(t, e), this.hitCanvas.setSize(t, e), this._setSmoothEnabled(), this);
	}
	_validateAdd(t) {
		const e = t.getType();
		e !== 'Group' && e !== 'Shape' && m.throw('You may only add groups and shapes to a layer.');
	}
	_toKonvaCanvas(t) {
		return (
			(t = { ...t }),
			(t.width = t.width || this.getWidth()),
			(t.height = t.height || this.getHeight()),
			(t.x = t.x !== void 0 ? t.x : this.x()),
			(t.y = t.y !== void 0 ? t.y : this.y()),
			E.prototype._toKonvaCanvas.call(this, t)
		);
	}
	_checkVisibility() {
		this.visible() ? (this.canvas._canvas.style.display = 'block') : (this.canvas._canvas.style.display = 'none');
	}
	_setSmoothEnabled() {
		this.getContext()._context.imageSmoothingEnabled = this.imageSmoothingEnabled();
	}
	getWidth() {
		if (this.parent) return this.parent.width();
	}
	setWidth() {
		m.warn('Can not change width of layer. Use "stage.width(value)" function instead.');
	}
	getHeight() {
		if (this.parent) return this.parent.height();
	}
	setHeight() {
		m.warn('Can not change height of layer. Use "stage.height(value)" function instead.');
	}
	batchDraw() {
		return (
			this._waitingForDraw ||
				((this._waitingForDraw = !0),
				m.requestAnimFrame(() => {
					(this.draw(), (this._waitingForDraw = !1));
				})),
			this
		);
	}
	getIntersection(t) {
		if (!this.isListening() || !this.isVisible()) return null;
		let e = 1,
			i = !1;
		for (;;) {
			for (let n = 0; n < Kn; n++) {
				const r = ki[n],
					a = this._getIntersection({ x: t.x + r.x * e, y: t.y + r.y * e }),
					o = a.shape;
				if (o) return o;
				if (((i = !!a.antialiased), !a.antialiased)) break;
			}
			if (i) e += 1;
			else return null;
		}
	}
	_getIntersection(t) {
		const e = this.hitCanvas.pixelRatio,
			i = this.hitCanvas.context.getImageData(Math.round(t.x * e), Math.round(t.y * e), 1, 1).data,
			n = i[3];
		if (n === 255) {
			const r = m.getHitColorKey(i[0], i[1], i[2]),
				a = Xt[r];
			return a ? { shape: a } : { antialiased: !0 };
		} else if (n > 0) return { antialiased: !0 };
		return {};
	}
	drawScene(t, e, i) {
		const n = this.getLayer(),
			r = t || (n && n.getCanvas());
		return (
			this._fire(qn, { node: this }),
			this.clearBeforeDraw() && r.getContext().clear(),
			et.prototype.drawScene.call(this, r, e, i),
			this._fire(jn, { node: this }),
			this
		);
	}
	drawHit(t, e) {
		const i = this.getLayer(),
			n = t || (i && i.hitCanvas);
		return (i && i.clearBeforeDraw() && i.getHitCanvas().getContext().clear(), et.prototype.drawHit.call(this, n, e), this);
	}
	enableHitGraph() {
		return (this.hitGraphEnabled(!0), this);
	}
	disableHitGraph() {
		return (this.hitGraphEnabled(!1), this);
	}
	setHitGraphEnabled(t) {
		(m.warn('hitGraphEnabled method is deprecated. Please use layer.listening() instead.'), this.listening(t));
	}
	getHitGraphEnabled(t) {
		return (m.warn('hitGraphEnabled method is deprecated. Please use layer.listening() instead.'), this.listening());
	}
	toggleHitCanvas() {
		if (!this.parent || !this.parent.content) return;
		const t = this.parent;
		!!this.hitCanvas._canvas.parentNode ? t.content.removeChild(this.hitCanvas._canvas) : t.content.appendChild(this.hitCanvas._canvas);
	}
	destroy() {
		return (m.releaseCanvas(this.getNativeCanvasElement(), this.getHitCanvas()._canvas), super.destroy());
	}
}
vt.prototype.nodeType = 'Layer';
K(vt);
u.addGetterSetter(vt, 'imageSmoothingEnabled', !0);
u.addGetterSetter(vt, 'clearBeforeDraw', !0);
u.addGetterSetter(vt, 'hitGraphEnabled', !0, st());
class Oe extends vt {
	constructor(t) {
		(super(t), this.listening(!1), m.warn('Konva.Fast layer is deprecated. Please use "new Konva.Layer({ listening: false })" instead.'));
	}
}
Oe.prototype.nodeType = 'FastLayer';
K(Oe);
class kt extends et {
	_validateAdd(t) {
		const e = t.getType();
		e !== 'Group' && e !== 'Shape' && m.throw('You may only add groups and shapes to groups.');
	}
}
kt.prototype.nodeType = 'Group';
K(kt);
const ge = (function () {
	return St.performance && St.performance.now
		? function () {
				return St.performance.now();
			}
		: function () {
				return new Date().getTime();
			};
})();
class nt {
	constructor(t, e) {
		((this.id = nt.animIdCounter++), (this.frame = { time: 0, timeDiff: 0, lastTime: ge(), frameRate: 0 }), (this.func = t), this.setLayers(e));
	}
	setLayers(t) {
		let e = [];
		return (t && (e = Array.isArray(t) ? t : [t]), (this.layers = e), this);
	}
	getLayers() {
		return this.layers;
	}
	addLayer(t) {
		const e = this.layers,
			i = e.length;
		for (let n = 0; n < i; n++) if (e[n]._id === t._id) return !1;
		return (this.layers.push(t), !0);
	}
	isRunning() {
		const e = nt.animations,
			i = e.length;
		for (let n = 0; n < i; n++) if (e[n].id === this.id) return !0;
		return !1;
	}
	start() {
		return (this.stop(), (this.frame.timeDiff = 0), (this.frame.lastTime = ge()), nt._addAnimation(this), this);
	}
	stop() {
		return (nt._removeAnimation(this), this);
	}
	_updateFrameObject(t) {
		((this.frame.timeDiff = t - this.frame.lastTime),
			(this.frame.lastTime = t),
			(this.frame.time += this.frame.timeDiff),
			(this.frame.frameRate = 1e3 / this.frame.timeDiff));
	}
	static _addAnimation(t) {
		(this.animations.push(t), this._handleAnimation());
	}
	static _removeAnimation(t) {
		const e = t.id,
			i = this.animations,
			n = i.length;
		for (let r = 0; r < n; r++)
			if (i[r].id === e) {
				this.animations.splice(r, 1);
				break;
			}
	}
	static _runFrames() {
		const t = {},
			e = this.animations;
		for (let i = 0; i < e.length; i++) {
			const n = e[i],
				r = n.layers,
				a = n.func;
			n._updateFrameObject(ge());
			const o = r.length;
			let h;
			if ((a ? (h = a.call(n, n.frame) !== !1) : (h = !0), !!h))
				for (let l = 0; l < o; l++) {
					const c = r[l];
					c._id !== void 0 && (t[c._id] = c);
				}
		}
		for (const i in t) t.hasOwnProperty(i) && t[i].batchDraw();
	}
	static _animationLoop() {
		const t = nt;
		t.animations.length ? (t._runFrames(), m.requestAnimFrame(t._animationLoop)) : (t.animRunning = !1);
	}
	static _handleAnimation() {
		this.animRunning || ((this.animRunning = !0), m.requestAnimFrame(this._animationLoop));
	}
}
nt.animations = [];
nt.animIdCounter = 0;
nt.animRunning = !1;
const $n = { node: 1, duration: 1, easing: 1, onFinish: 1, yoyo: 1 },
	Qn = 1,
	qe = 2,
	je = 3,
	Ke = ['fill', 'stroke', 'shadowColor'];
let Jn = 0;
class Zn {
	constructor(t, e, i, n, r, a, o) {
		((this.prop = t),
			(this.propFunc = e),
			(this.begin = n),
			(this._pos = n),
			(this.duration = a),
			(this._change = 0),
			(this.prevPos = 0),
			(this.yoyo = o),
			(this._time = 0),
			(this._position = 0),
			(this._startTime = 0),
			(this._finish = 0),
			(this.func = i),
			(this._change = r - this.begin),
			this.pause());
	}
	fire(t) {
		const e = this[t];
		e && e();
	}
	setTime(t) {
		t > this.duration
			? this.yoyo
				? ((this._time = this.duration), this.reverse())
				: this.finish()
			: t < 0
				? this.yoyo
					? ((this._time = 0), this.play())
					: this.reset()
				: ((this._time = t), this.update());
	}
	getTime() {
		return this._time;
	}
	setPosition(t) {
		((this.prevPos = this._pos), this.propFunc(t), (this._pos = t));
	}
	getPosition(t) {
		return (t === void 0 && (t = this._time), this.func(t, this.begin, this._change, this.duration));
	}
	play() {
		((this.state = qe), (this._startTime = this.getTimer() - this._time), this.onEnterFrame(), this.fire('onPlay'));
	}
	reverse() {
		((this.state = je),
			(this._time = this.duration - this._time),
			(this._startTime = this.getTimer() - this._time),
			this.onEnterFrame(),
			this.fire('onReverse'));
	}
	seek(t) {
		(this.pause(), (this._time = t), this.update(), this.fire('onSeek'));
	}
	reset() {
		(this.pause(), (this._time = 0), this.update(), this.fire('onReset'));
	}
	finish() {
		(this.pause(), (this._time = this.duration), this.update(), this.fire('onFinish'));
	}
	update() {
		(this.setPosition(this.getPosition(this._time)), this.fire('onUpdate'));
	}
	onEnterFrame() {
		const t = this.getTimer() - this._startTime;
		this.state === qe ? this.setTime(t) : this.state === je && this.setTime(this.duration - t);
	}
	pause() {
		((this.state = Qn), this.fire('onPause'));
	}
	getTimer() {
		return new Date().getTime();
	}
}
class V {
	constructor(t) {
		const e = this,
			i = t.node,
			n = i._id,
			r = t.easing || Ut.Linear,
			a = !!t.yoyo;
		let o, h;
		(typeof t.duration > 'u' ? (o = 0.3) : t.duration === 0 ? (o = 0.001) : (o = t.duration), (this.node = i), (this._id = Jn++));
		const l = i.getLayer() || (i instanceof A.Stage ? i.getLayers() : null);
		(l || m.error('Tween constructor have `node` that is not in a layer. Please add node into layer first.'),
			(this.anim = new nt(function () {
				e.tween.onEnterFrame();
			}, l)),
			(this.tween = new Zn(
				h,
				function (c) {
					e._tweenFunc(c);
				},
				r,
				0,
				1,
				o * 1e3,
				a
			)),
			this._addListeners(),
			V.attrs[n] || (V.attrs[n] = {}),
			V.attrs[n][this._id] || (V.attrs[n][this._id] = {}),
			V.tweens[n] || (V.tweens[n] = {}));
		for (h in t) $n[h] === void 0 && this._addAttr(h, t[h]);
		(this.reset(), (this.onFinish = t.onFinish), (this.onReset = t.onReset), (this.onUpdate = t.onUpdate));
	}
	_addAttr(t, e) {
		const i = this.node,
			n = i._id;
		let r, a, o, h, l;
		const c = V.tweens[n][t];
		c && delete V.attrs[n][c][t];
		let f = i.getAttr(t);
		if (m._isArray(e))
			if (
				((r = []),
				(a = Math.max(e.length, f.length)),
				t === 'points' &&
					e.length !== f.length &&
					(e.length > f.length
						? ((h = f), (f = m._prepareArrayForTween(f, e, i.closed())))
						: ((o = e), (e = m._prepareArrayForTween(e, f, i.closed())))),
				t.indexOf('fill') === 0)
			)
				for (let d = 0; d < a; d++)
					if (d % 2 === 0) r.push(e[d] - f[d]);
					else {
						const p = m.colorToRGBA(f[d]);
						((l = m.colorToRGBA(e[d])), (f[d] = p), r.push({ r: l.r - p.r, g: l.g - p.g, b: l.b - p.b, a: l.a - p.a }));
					}
			else for (let d = 0; d < a; d++) r.push(e[d] - f[d]);
		else
			Ke.indexOf(t) !== -1
				? ((f = m.colorToRGBA(f)), (l = m.colorToRGBA(e)), (r = { r: l.r - f.r, g: l.g - f.g, b: l.b - f.b, a: l.a - f.a }))
				: (r = e - f);
		((V.attrs[n][this._id][t] = { start: f, diff: r, end: e, trueEnd: o, trueStart: h }), (V.tweens[n][t] = this._id));
	}
	_tweenFunc(t) {
		const e = this.node,
			i = V.attrs[e._id][this._id];
		let n, r, a, o, h, l, c, f;
		for (n in i) {
			if (((r = i[n]), (a = r.start), (o = r.diff), (f = r.end), m._isArray(a)))
				if (((h = []), (c = Math.max(a.length, f.length)), n.indexOf('fill') === 0))
					for (l = 0; l < c; l++)
						l % 2 === 0
							? h.push((a[l] || 0) + o[l] * t)
							: h.push(
									'rgba(' +
										Math.round(a[l].r + o[l].r * t) +
										',' +
										Math.round(a[l].g + o[l].g * t) +
										',' +
										Math.round(a[l].b + o[l].b * t) +
										',' +
										(a[l].a + o[l].a * t) +
										')'
								);
				else for (l = 0; l < c; l++) h.push((a[l] || 0) + o[l] * t);
			else
				Ke.indexOf(n) !== -1
					? (h =
							'rgba(' + Math.round(a.r + o.r * t) + ',' + Math.round(a.g + o.g * t) + ',' + Math.round(a.b + o.b * t) + ',' + (a.a + o.a * t) + ')')
					: (h = a + o * t);
			e.setAttr(n, h);
		}
	}
	_addListeners() {
		((this.tween.onPlay = () => {
			this.anim.start();
		}),
			(this.tween.onReverse = () => {
				this.anim.start();
			}),
			(this.tween.onPause = () => {
				this.anim.stop();
			}),
			(this.tween.onFinish = () => {
				const t = this.node,
					e = V.attrs[t._id][this._id];
				(e.points && e.points.trueEnd && t.setAttr('points', e.points.trueEnd), this.onFinish && this.onFinish.call(this));
			}),
			(this.tween.onReset = () => {
				const t = this.node,
					e = V.attrs[t._id][this._id];
				(e.points && e.points.trueStart && t.points(e.points.trueStart), this.onReset && this.onReset());
			}),
			(this.tween.onUpdate = () => {
				this.onUpdate && this.onUpdate.call(this);
			}));
	}
	play() {
		return (this.tween.play(), this);
	}
	reverse() {
		return (this.tween.reverse(), this);
	}
	reset() {
		return (this.tween.reset(), this);
	}
	seek(t) {
		return (this.tween.seek(t * 1e3), this);
	}
	pause() {
		return (this.tween.pause(), this);
	}
	finish() {
		return (this.tween.finish(), this);
	}
	destroy() {
		const t = this.node._id,
			e = this._id,
			i = V.tweens[t];
		(this.pause(), this.anim && this.anim.stop());
		for (const n in i) delete V.tweens[t][n];
		(delete V.attrs[t][e],
			V.tweens[t] && (Object.keys(V.tweens[t]).length === 0 && delete V.tweens[t], Object.keys(V.attrs[t]).length === 0 && delete V.attrs[t]));
	}
}
V.attrs = {};
V.tweens = {};
E.prototype.to = function (s) {
	const t = s.onFinish;
	((s.node = this),
		(s.onFinish = function () {
			(this.destroy(), t && t());
		}),
		new V(s).play());
};
const Ut = {
		BackEaseIn(s, t, e, i) {
			return e * (s /= i) * s * ((1.70158 + 1) * s - 1.70158) + t;
		},
		BackEaseOut(s, t, e, i) {
			return e * ((s = s / i - 1) * s * ((1.70158 + 1) * s + 1.70158) + 1) + t;
		},
		BackEaseInOut(s, t, e, i) {
			let n = 1.70158;
			return (s /= i / 2) < 1
				? (e / 2) * (s * s * (((n *= 1.525) + 1) * s - n)) + t
				: (e / 2) * ((s -= 2) * s * (((n *= 1.525) + 1) * s + n) + 2) + t;
		},
		ElasticEaseIn(s, t, e, i, n, r) {
			let a = 0;
			return s === 0
				? t
				: (s /= i) === 1
					? t + e
					: (r || (r = i * 0.3),
						!n || n < Math.abs(e) ? ((n = e), (a = r / 4)) : (a = (r / (2 * Math.PI)) * Math.asin(e / n)),
						-(n * Math.pow(2, 10 * (s -= 1)) * Math.sin(((s * i - a) * (2 * Math.PI)) / r)) + t);
		},
		ElasticEaseOut(s, t, e, i, n, r) {
			let a = 0;
			return s === 0
				? t
				: (s /= i) === 1
					? t + e
					: (r || (r = i * 0.3),
						!n || n < Math.abs(e) ? ((n = e), (a = r / 4)) : (a = (r / (2 * Math.PI)) * Math.asin(e / n)),
						n * Math.pow(2, -10 * s) * Math.sin(((s * i - a) * (2 * Math.PI)) / r) + e + t);
		},
		ElasticEaseInOut(s, t, e, i, n, r) {
			let a = 0;
			return s === 0
				? t
				: (s /= i / 2) === 2
					? t + e
					: (r || (r = i * (0.3 * 1.5)),
						!n || n < Math.abs(e) ? ((n = e), (a = r / 4)) : (a = (r / (2 * Math.PI)) * Math.asin(e / n)),
						s < 1
							? -0.5 * (n * Math.pow(2, 10 * (s -= 1)) * Math.sin(((s * i - a) * (2 * Math.PI)) / r)) + t
							: n * Math.pow(2, -10 * (s -= 1)) * Math.sin(((s * i - a) * (2 * Math.PI)) / r) * 0.5 + e + t);
		},
		BounceEaseOut(s, t, e, i) {
			return (s /= i) < 1 / 2.75
				? e * (7.5625 * s * s) + t
				: s < 2 / 2.75
					? e * (7.5625 * (s -= 1.5 / 2.75) * s + 0.75) + t
					: s < 2.5 / 2.75
						? e * (7.5625 * (s -= 2.25 / 2.75) * s + 0.9375) + t
						: e * (7.5625 * (s -= 2.625 / 2.75) * s + 0.984375) + t;
		},
		BounceEaseIn(s, t, e, i) {
			return e - Ut.BounceEaseOut(i - s, 0, e, i) + t;
		},
		BounceEaseInOut(s, t, e, i) {
			return s < i / 2 ? Ut.BounceEaseIn(s * 2, 0, e, i) * 0.5 + t : Ut.BounceEaseOut(s * 2 - i, 0, e, i) * 0.5 + e * 0.5 + t;
		},
		EaseIn(s, t, e, i) {
			return e * (s /= i) * s + t;
		},
		EaseOut(s, t, e, i) {
			return -e * (s /= i) * (s - 2) + t;
		},
		EaseInOut(s, t, e, i) {
			return (s /= i / 2) < 1 ? (e / 2) * s * s + t : (-e / 2) * (--s * (s - 2) - 1) + t;
		},
		StrongEaseIn(s, t, e, i) {
			return e * (s /= i) * s * s * s * s + t;
		},
		StrongEaseOut(s, t, e, i) {
			return e * ((s = s / i - 1) * s * s * s * s + 1) + t;
		},
		StrongEaseInOut(s, t, e, i) {
			return (s /= i / 2) < 1 ? (e / 2) * s * s * s * s * s + t : (e / 2) * ((s -= 2) * s * s * s * s + 2) + t;
		},
		Linear(s, t, e, i) {
			return (e * s) / i + t;
		}
	},
	$e = m._assign(A, {
		Util: m,
		Transform: tt,
		Node: E,
		Container: et,
		Stage: le,
		stages: Yt,
		Layer: vt,
		FastLayer: Oe,
		Group: kt,
		DD: z,
		Shape: x,
		shapes: Xt,
		Animation: nt,
		Tween: V,
		Easings: Ut,
		Context: oe,
		Canvas: Ae
	});
class ot extends x {
	_sceneFunc(t) {
		const e = A.getAngle(this.angle()),
			i = this.clockwise();
		(t.beginPath(), t.arc(0, 0, this.outerRadius(), 0, e, i), t.arc(0, 0, this.innerRadius(), e, 0, !i), t.closePath(), t.fillStrokeShape(this));
	}
	getWidth() {
		return this.outerRadius() * 2;
	}
	getHeight() {
		return this.outerRadius() * 2;
	}
	setWidth(t) {
		this.outerRadius(t / 2);
	}
	setHeight(t) {
		this.outerRadius(t / 2);
	}
	getSelfRect() {
		const t = this.innerRadius(),
			e = this.outerRadius(),
			i = this.clockwise(),
			n = A.getAngle(i ? 360 - this.angle() : this.angle()),
			r = Math.cos(Math.min(n, Math.PI)),
			a = 1,
			o = Math.sin(Math.min(Math.max(Math.PI, n), (3 * Math.PI) / 2)),
			h = Math.sin(Math.min(n, Math.PI / 2)),
			l = r * (r > 0 ? t : e),
			c = a * e,
			f = o * (o > 0 ? t : e),
			d = h * (h > 0 ? e : t);
		return { x: l, y: i ? -1 * d : f, width: c - l, height: d - f };
	}
}
ot.prototype._centroid = !0;
ot.prototype.className = 'Arc';
ot.prototype._attrsAffectingSize = ['innerRadius', 'outerRadius', 'angle', 'clockwise'];
K(ot);
u.addGetterSetter(ot, 'innerRadius', 0, P());
u.addGetterSetter(ot, 'outerRadius', 0, P());
u.addGetterSetter(ot, 'angle', 0, P());
u.addGetterSetter(ot, 'clockwise', !1, st());
function Ce(s, t, e, i, n, r, a) {
	const o = Math.sqrt(Math.pow(e - s, 2) + Math.pow(i - t, 2)),
		h = Math.sqrt(Math.pow(n - e, 2) + Math.pow(r - i, 2)),
		l = (a * o) / (o + h),
		c = (a * h) / (o + h),
		f = e - l * (n - s),
		d = i - l * (r - t),
		p = e + c * (n - s),
		g = i + c * (r - t);
	return [f, d, p, g];
}
function Qe(s, t) {
	const e = s.length,
		i = [];
	for (let n = 2; n < e - 2; n += 2) {
		const r = Ce(s[n - 2], s[n - 1], s[n], s[n + 1], s[n + 2], s[n + 3], t);
		isNaN(r[0]) || (i.push(r[0]), i.push(r[1]), i.push(s[n]), i.push(s[n + 1]), i.push(r[2]), i.push(r[3]));
	}
	return i;
}
function ts(s) {
	const t = [
			[s[0], s[2], s[4], s[6]],
			[s[1], s[3], s[5], s[7]]
		],
		e = [];
	for (const i of t) {
		const n = -3 * i[0] + 9 * i[1] - 9 * i[2] + 3 * i[3];
		if (n !== 0) {
			const r = 6 * i[0] - 12 * i[1] + 6 * i[2],
				a = -3 * i[0] + 3 * i[1],
				o = r * r - 4 * n * a;
			if (o >= 0) {
				const h = Math.sqrt(o);
				(e.push((-r + h) / (2 * n)), e.push((-r - h) / (2 * n)));
			}
		}
	}
	return e
		.filter((i) => i > 0 && i < 1)
		.flatMap((i) =>
			t.map((n) => {
				const r = 1 - i;
				return r * r * r * n[0] + 3 * r * r * i * n[1] + 3 * r * i * i * n[2] + i * i * i * n[3];
			})
		);
}
class ht extends x {
	constructor(t) {
		(super(t),
			this.on('pointsChange.konva tensionChange.konva closedChange.konva bezierChange.konva', function () {
				this._clearCache('tensionPoints');
			}));
	}
	_sceneFunc(t) {
		const e = this.points(),
			i = e.length,
			n = this.tension(),
			r = this.closed(),
			a = this.bezier();
		if (!i) return;
		let o = 0;
		if ((t.beginPath(), t.moveTo(e[0], e[1]), n !== 0 && i > 4)) {
			const h = this.getTensionPoints(),
				l = h.length;
			for (o = r ? 0 : 4, r || t.quadraticCurveTo(h[0], h[1], h[2], h[3]); o < l - 2; )
				t.bezierCurveTo(h[o++], h[o++], h[o++], h[o++], h[o++], h[o++]);
			r || t.quadraticCurveTo(h[l - 2], h[l - 1], e[i - 2], e[i - 1]);
		} else if (a) for (o = 2; o < i; ) t.bezierCurveTo(e[o++], e[o++], e[o++], e[o++], e[o++], e[o++]);
		else for (o = 2; o < i; o += 2) t.lineTo(e[o], e[o + 1]);
		r ? (t.closePath(), t.fillStrokeShape(this)) : t.strokeShape(this);
	}
	getTensionPoints() {
		return this._getCache('tensionPoints', this._getTensionPoints);
	}
	_getTensionPoints() {
		return this.closed() ? this._getTensionPointsClosed() : Qe(this.points(), this.tension());
	}
	_getTensionPointsClosed() {
		const t = this.points(),
			e = t.length,
			i = this.tension(),
			n = Ce(t[e - 2], t[e - 1], t[0], t[1], t[2], t[3], i),
			r = Ce(t[e - 4], t[e - 3], t[e - 2], t[e - 1], t[0], t[1], i),
			a = Qe(t, i);
		return [n[2], n[3]].concat(a).concat([r[0], r[1], t[e - 2], t[e - 1], r[2], r[3], n[0], n[1], t[0], t[1]]);
	}
	getWidth() {
		return this.getSelfRect().width;
	}
	getHeight() {
		return this.getSelfRect().height;
	}
	getSelfRect() {
		let t = this.points();
		if (t.length < 4) return { x: t[0] || 0, y: t[1] || 0, width: 0, height: 0 };
		this.tension() !== 0
			? (t = [t[0], t[1], ...this._getTensionPoints(), t[t.length - 2], t[t.length - 1]])
			: this.bezier()
				? (t = [t[0], t[1], ...ts(this.points()), t[t.length - 2], t[t.length - 1]])
				: (t = this.points());
		let e = t[0],
			i = t[0],
			n = t[1],
			r = t[1],
			a,
			o;
		for (let h = 0; h < t.length / 2; h++)
			((a = t[h * 2]), (o = t[h * 2 + 1]), (e = Math.min(e, a)), (i = Math.max(i, a)), (n = Math.min(n, o)), (r = Math.max(r, o)));
		return { x: e, y: n, width: i - e, height: r - n };
	}
}
ht.prototype.className = 'Line';
ht.prototype._attrsAffectingSize = ['points', 'bezier', 'tension'];
K(ht);
u.addGetterSetter(ht, 'closed', !1);
u.addGetterSetter(ht, 'bezier', !1);
u.addGetterSetter(ht, 'tension', 0, P());
u.addGetterSetter(ht, 'points', [], mn());
const es = [
		[],
		[],
		[-0.5773502691896257, 0.5773502691896257],
		[0, -0.7745966692414834, 0.7745966692414834],
		[-0.33998104358485626, 0.33998104358485626, -0.8611363115940526, 0.8611363115940526],
		[0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664],
		[0.6612093864662645, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969, -0.932469514203152, 0.932469514203152],
		[0, 0.4058451513773972, -0.4058451513773972, -0.7415311855993945, 0.7415311855993945, -0.9491079123427585, 0.9491079123427585],
		[
			-0.1834346424956498, 0.1834346424956498, -0.525532409916329, 0.525532409916329, -0.7966664774136267, 0.7966664774136267, -0.9602898564975363,
			0.9602898564975363
		],
		[
			0, -0.8360311073266358, 0.8360311073266358, -0.9681602395076261, 0.9681602395076261, -0.3242534234038089, 0.3242534234038089,
			-0.6133714327005904, 0.6133714327005904
		],
		[
			-0.14887433898163122, 0.14887433898163122, -0.4333953941292472, 0.4333953941292472, -0.6794095682990244, 0.6794095682990244,
			-0.8650633666889845, 0.8650633666889845, -0.9739065285171717, 0.9739065285171717
		],
		[
			0, -0.26954315595234496, 0.26954315595234496, -0.5190961292068118, 0.5190961292068118, -0.7301520055740494, 0.7301520055740494,
			-0.8870625997680953, 0.8870625997680953, -0.978228658146057, 0.978228658146057
		],
		[
			-0.1252334085114689, 0.1252334085114689, -0.3678314989981802, 0.3678314989981802, -0.5873179542866175, 0.5873179542866175, -0.7699026741943047,
			0.7699026741943047, -0.9041172563704749, 0.9041172563704749, -0.9815606342467192, 0.9815606342467192
		],
		[
			0, -0.2304583159551348, 0.2304583159551348, -0.44849275103644687, 0.44849275103644687, -0.6423493394403402, 0.6423493394403402,
			-0.8015780907333099, 0.8015780907333099, -0.9175983992229779, 0.9175983992229779, -0.9841830547185881, 0.9841830547185881
		],
		[
			-0.10805494870734367, 0.10805494870734367, -0.31911236892788974, 0.31911236892788974, -0.5152486363581541, 0.5152486363581541,
			-0.6872929048116855, 0.6872929048116855, -0.827201315069765, 0.827201315069765, -0.9284348836635735, 0.9284348836635735, -0.9862838086968123,
			0.9862838086968123
		],
		[
			0, -0.20119409399743451, 0.20119409399743451, -0.3941513470775634, 0.3941513470775634, -0.5709721726085388, 0.5709721726085388,
			-0.7244177313601701, 0.7244177313601701, -0.8482065834104272, 0.8482065834104272, -0.937273392400706, 0.937273392400706, -0.9879925180204854,
			0.9879925180204854
		],
		[
			-0.09501250983763744, 0.09501250983763744, -0.2816035507792589, 0.2816035507792589, -0.45801677765722737, 0.45801677765722737,
			-0.6178762444026438, 0.6178762444026438, -0.755404408355003, 0.755404408355003, -0.8656312023878318, 0.8656312023878318, -0.9445750230732326,
			0.9445750230732326, -0.9894009349916499, 0.9894009349916499
		],
		[
			0, -0.17848418149584785, 0.17848418149584785, -0.3512317634538763, 0.3512317634538763, -0.5126905370864769, 0.5126905370864769,
			-0.6576711592166907, 0.6576711592166907, -0.7815140038968014, 0.7815140038968014, -0.8802391537269859, 0.8802391537269859, -0.9506755217687678,
			0.9506755217687678, -0.9905754753144174, 0.9905754753144174
		],
		[
			-0.0847750130417353, 0.0847750130417353, -0.2518862256915055, 0.2518862256915055, -0.41175116146284263, 0.41175116146284263,
			-0.5597708310739475, 0.5597708310739475, -0.6916870430603532, 0.6916870430603532, -0.8037049589725231, 0.8037049589725231, -0.8926024664975557,
			0.8926024664975557, -0.9558239495713977, 0.9558239495713977, -0.9915651684209309, 0.9915651684209309
		],
		[
			0, -0.16035864564022537, 0.16035864564022537, -0.31656409996362983, 0.31656409996362983, -0.46457074137596094, 0.46457074137596094,
			-0.600545304661681, 0.600545304661681, -0.7209661773352294, 0.7209661773352294, -0.8227146565371428, 0.8227146565371428, -0.9031559036148179,
			0.9031559036148179, -0.96020815213483, 0.96020815213483, -0.9924068438435844, 0.9924068438435844
		],
		[
			-0.07652652113349734, 0.07652652113349734, -0.22778585114164507, 0.22778585114164507, -0.37370608871541955, 0.37370608871541955,
			-0.5108670019508271, 0.5108670019508271, -0.636053680726515, 0.636053680726515, -0.7463319064601508, 0.7463319064601508, -0.8391169718222188,
			0.8391169718222188, -0.912234428251326, 0.912234428251326, -0.9639719272779138, 0.9639719272779138, -0.9931285991850949, 0.9931285991850949
		],
		[
			0, -0.1455618541608951, 0.1455618541608951, -0.2880213168024011, 0.2880213168024011, -0.4243421202074388, 0.4243421202074388,
			-0.5516188358872198, 0.5516188358872198, -0.6671388041974123, 0.6671388041974123, -0.7684399634756779, 0.7684399634756779, -0.8533633645833173,
			0.8533633645833173, -0.9200993341504008, 0.9200993341504008, -0.9672268385663063, 0.9672268385663063, -0.9937521706203895, 0.9937521706203895
		],
		[
			-0.06973927331972223, 0.06973927331972223, -0.20786042668822127, 0.20786042668822127, -0.34193582089208424, 0.34193582089208424,
			-0.469355837986757, 0.469355837986757, -0.5876404035069116, 0.5876404035069116, -0.6944872631866827, 0.6944872631866827, -0.7878168059792081,
			0.7878168059792081, -0.8658125777203002, 0.8658125777203002, -0.926956772187174, 0.926956772187174, -0.9700604978354287, 0.9700604978354287,
			-0.9942945854823992, 0.9942945854823992
		],
		[
			0, -0.1332568242984661, 0.1332568242984661, -0.26413568097034495, 0.26413568097034495, -0.3903010380302908, 0.3903010380302908,
			-0.5095014778460075, 0.5095014778460075, -0.6196098757636461, 0.6196098757636461, -0.7186613631319502, 0.7186613631319502, -0.8048884016188399,
			0.8048884016188399, -0.8767523582704416, 0.8767523582704416, -0.9329710868260161, 0.9329710868260161, -0.9725424712181152, 0.9725424712181152,
			-0.9947693349975522, 0.9947693349975522
		],
		[
			-0.06405689286260563, 0.06405689286260563, -0.1911188674736163, 0.1911188674736163, -0.3150426796961634, 0.3150426796961634,
			-0.4337935076260451, 0.4337935076260451, -0.5454214713888396, 0.5454214713888396, -0.6480936519369755, 0.6480936519369755, -0.7401241915785544,
			0.7401241915785544, -0.820001985973903, 0.820001985973903, -0.8864155270044011, 0.8864155270044011, -0.9382745520027328, 0.9382745520027328,
			-0.9747285559713095, 0.9747285559713095, -0.9951872199970213, 0.9951872199970213
		]
	],
	is = [
		[],
		[],
		[1, 1],
		[0.8888888888888888, 0.5555555555555556, 0.5555555555555556],
		[0.6521451548625461, 0.6521451548625461, 0.34785484513745385, 0.34785484513745385],
		[0.5688888888888889, 0.47862867049936647, 0.47862867049936647, 0.23692688505618908, 0.23692688505618908],
		[0.3607615730481386, 0.3607615730481386, 0.46791393457269104, 0.46791393457269104, 0.17132449237917036, 0.17132449237917036],
		[0.4179591836734694, 0.3818300505051189, 0.3818300505051189, 0.27970539148927664, 0.27970539148927664, 0.1294849661688697, 0.1294849661688697],
		[
			0.362683783378362, 0.362683783378362, 0.31370664587788727, 0.31370664587788727, 0.22238103445337448, 0.22238103445337448, 0.10122853629037626,
			0.10122853629037626
		],
		[
			0.3302393550012598, 0.1806481606948574, 0.1806481606948574, 0.08127438836157441, 0.08127438836157441, 0.31234707704000286, 0.31234707704000286,
			0.26061069640293544, 0.26061069640293544
		],
		[
			0.29552422471475287, 0.29552422471475287, 0.26926671930999635, 0.26926671930999635, 0.21908636251598204, 0.21908636251598204,
			0.1494513491505806, 0.1494513491505806, 0.06667134430868814, 0.06667134430868814
		],
		[
			0.2729250867779006, 0.26280454451024665, 0.26280454451024665, 0.23319376459199048, 0.23319376459199048, 0.18629021092773426,
			0.18629021092773426, 0.1255803694649046, 0.1255803694649046, 0.05566856711617366, 0.05566856711617366
		],
		[
			0.24914704581340277, 0.24914704581340277, 0.2334925365383548, 0.2334925365383548, 0.20316742672306592, 0.20316742672306592, 0.16007832854334622,
			0.16007832854334622, 0.10693932599531843, 0.10693932599531843, 0.04717533638651183, 0.04717533638651183
		],
		[
			0.2325515532308739, 0.22628318026289723, 0.22628318026289723, 0.2078160475368885, 0.2078160475368885, 0.17814598076194574, 0.17814598076194574,
			0.13887351021978725, 0.13887351021978725, 0.09212149983772845, 0.09212149983772845, 0.04048400476531588, 0.04048400476531588
		],
		[
			0.2152638534631578, 0.2152638534631578, 0.2051984637212956, 0.2051984637212956, 0.18553839747793782, 0.18553839747793782, 0.15720316715819355,
			0.15720316715819355, 0.12151857068790319, 0.12151857068790319, 0.08015808715976021, 0.08015808715976021, 0.03511946033175186,
			0.03511946033175186
		],
		[
			0.2025782419255613, 0.19843148532711158, 0.19843148532711158, 0.1861610000155622, 0.1861610000155622, 0.16626920581699392, 0.16626920581699392,
			0.13957067792615432, 0.13957067792615432, 0.10715922046717194, 0.10715922046717194, 0.07036604748810812, 0.07036604748810812,
			0.03075324199611727, 0.03075324199611727
		],
		[
			0.1894506104550685, 0.1894506104550685, 0.18260341504492358, 0.18260341504492358, 0.16915651939500254, 0.16915651939500254, 0.14959598881657674,
			0.14959598881657674, 0.12462897125553388, 0.12462897125553388, 0.09515851168249279, 0.09515851168249279, 0.062253523938647894,
			0.062253523938647894, 0.027152459411754096, 0.027152459411754096
		],
		[
			0.17944647035620653, 0.17656270536699264, 0.17656270536699264, 0.16800410215645004, 0.16800410215645004, 0.15404576107681028,
			0.15404576107681028, 0.13513636846852548, 0.13513636846852548, 0.11188384719340397, 0.11188384719340397, 0.08503614831717918,
			0.08503614831717918, 0.0554595293739872, 0.0554595293739872, 0.02414830286854793, 0.02414830286854793
		],
		[
			0.1691423829631436, 0.1691423829631436, 0.16427648374583273, 0.16427648374583273, 0.15468467512626524, 0.15468467512626524, 0.14064291467065065,
			0.14064291467065065, 0.12255520671147846, 0.12255520671147846, 0.10094204410628717, 0.10094204410628717, 0.07642573025488905,
			0.07642573025488905, 0.0497145488949698, 0.0497145488949698, 0.02161601352648331, 0.02161601352648331
		],
		[
			0.1610544498487837, 0.15896884339395434, 0.15896884339395434, 0.15276604206585967, 0.15276604206585967, 0.1426067021736066, 0.1426067021736066,
			0.12875396253933621, 0.12875396253933621, 0.11156664554733399, 0.11156664554733399, 0.09149002162245, 0.09149002162245, 0.06904454273764123,
			0.06904454273764123, 0.0448142267656996, 0.0448142267656996, 0.019461788229726478, 0.019461788229726478
		],
		[
			0.15275338713072584, 0.15275338713072584, 0.14917298647260374, 0.14917298647260374, 0.14209610931838204, 0.14209610931838204,
			0.13168863844917664, 0.13168863844917664, 0.11819453196151841, 0.11819453196151841, 0.10193011981724044, 0.10193011981724044,
			0.08327674157670475, 0.08327674157670475, 0.06267204833410907, 0.06267204833410907, 0.04060142980038694, 0.04060142980038694,
			0.017614007139152118, 0.017614007139152118
		],
		[
			0.14608113364969041, 0.14452440398997005, 0.14452440398997005, 0.13988739479107315, 0.13988739479107315, 0.13226893863333747,
			0.13226893863333747, 0.12183141605372853, 0.12183141605372853, 0.10879729916714838, 0.10879729916714838, 0.09344442345603386,
			0.09344442345603386, 0.0761001136283793, 0.0761001136283793, 0.057134425426857205, 0.057134425426857205, 0.036953789770852494,
			0.036953789770852494, 0.016017228257774335, 0.016017228257774335
		],
		[
			0.13925187285563198, 0.13925187285563198, 0.13654149834601517, 0.13654149834601517, 0.13117350478706238, 0.13117350478706238,
			0.12325237681051242, 0.12325237681051242, 0.11293229608053922, 0.11293229608053922, 0.10041414444288096, 0.10041414444288096,
			0.08594160621706773, 0.08594160621706773, 0.06979646842452049, 0.06979646842452049, 0.052293335152683286, 0.052293335152683286,
			0.03377490158481415, 0.03377490158481415, 0.0146279952982722, 0.0146279952982722
		],
		[
			0.13365457218610619, 0.1324620394046966, 0.1324620394046966, 0.12890572218808216, 0.12890572218808216, 0.12304908430672953, 0.12304908430672953,
			0.11499664022241136, 0.11499664022241136, 0.10489209146454141, 0.10489209146454141, 0.09291576606003515, 0.09291576606003515,
			0.07928141177671895, 0.07928141177671895, 0.06423242140852585, 0.06423242140852585, 0.04803767173108467, 0.04803767173108467,
			0.030988005856979445, 0.030988005856979445, 0.013411859487141771, 0.013411859487141771
		],
		[
			0.12793819534675216, 0.12793819534675216, 0.1258374563468283, 0.1258374563468283, 0.12167047292780339, 0.12167047292780339, 0.1155056680537256,
			0.1155056680537256, 0.10744427011596563, 0.10744427011596563, 0.09761865210411388, 0.09761865210411388, 0.08619016153195327,
			0.08619016153195327, 0.0733464814110803, 0.0733464814110803, 0.05929858491543678, 0.05929858491543678, 0.04427743881741981, 0.04427743881741981,
			0.028531388628933663, 0.028531388628933663, 0.0123412297999872, 0.0123412297999872
		]
	],
	ns = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]],
	Je = (s, t, e) => {
		let i, n;
		const a = e / 2;
		i = 0;
		for (let o = 0; o < 20; o++) ((n = a * es[20][o] + a), (i += is[20][o] * ss(s, t, n)));
		return a * i;
	},
	Ze = (s, t, e) => {
		e === void 0 && (e = 1);
		const i = s[0] - 2 * s[1] + s[2],
			n = t[0] - 2 * t[1] + t[2],
			r = 2 * s[1] - 2 * s[0],
			a = 2 * t[1] - 2 * t[0],
			o = 4 * (i * i + n * n),
			h = 4 * (i * r + n * a),
			l = r * r + a * a;
		if (o === 0) return e * Math.sqrt(Math.pow(s[2] - s[0], 2) + Math.pow(t[2] - t[0], 2));
		const c = h / (2 * o),
			f = l / o,
			d = e + c,
			p = f - c * c,
			g = d * d + p > 0 ? Math.sqrt(d * d + p) : 0,
			_ = c * c + p > 0 ? Math.sqrt(c * c + p) : 0,
			b = c + Math.sqrt(c * c + p) !== 0 ? p * Math.log(Math.abs((d + g) / (c + _))) : 0;
		return (Math.sqrt(o) / 2) * (d * g - c * _ + b);
	};
function ss(s, t, e) {
	const i = xe(1, e, s),
		n = xe(1, e, t),
		r = i * i + n * n;
	return Math.sqrt(r);
}
const xe = (s, t, e) => {
		const i = e.length - 1;
		let n, r;
		if (i === 0) return 0;
		if (s === 0) {
			r = 0;
			for (let a = 0; a <= i; a++) r += ns[i][a] * Math.pow(1 - t, i - a) * Math.pow(t, a) * e[a];
			return r;
		} else {
			n = new Array(i);
			for (let a = 0; a < i; a++) n[a] = i * (e[a + 1] - e[a]);
			return xe(s - 1, t, n);
		}
	},
	ti = (s, t, e) => {
		let i = 1,
			n = s / t,
			r = (s - e(n)) / t,
			a = 0;
		for (; i > 0.001; ) {
			const o = e(n + r),
				h = Math.abs(s - o) / t;
			if (h < i) ((i = h), (n += r));
			else {
				const l = e(n - r),
					c = Math.abs(s - l) / t;
				c < i ? ((i = c), (n -= r)) : (r /= 2);
			}
			if ((a++, a > 500)) break;
		}
		return n;
	};
class q extends x {
	constructor(t) {
		(super(t),
			(this.dataArray = []),
			(this.pathLength = 0),
			this._readDataAttribute(),
			this.on('dataChange.konva', function () {
				this._readDataAttribute();
			}));
	}
	_readDataAttribute() {
		((this.dataArray = q.parsePathData(this.data())), (this.pathLength = q.getPathLength(this.dataArray)));
	}
	_sceneFunc(t) {
		const e = this.dataArray;
		t.beginPath();
		let i = !1;
		for (let n = 0; n < e.length; n++) {
			const r = e[n].command,
				a = e[n].points;
			switch (r) {
				case 'L':
					t.lineTo(a[0], a[1]);
					break;
				case 'M':
					t.moveTo(a[0], a[1]);
					break;
				case 'C':
					t.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]);
					break;
				case 'Q':
					t.quadraticCurveTo(a[0], a[1], a[2], a[3]);
					break;
				case 'A':
					const o = a[0],
						h = a[1],
						l = a[2],
						c = a[3],
						f = a[4],
						d = a[5],
						p = a[6],
						g = a[7],
						_ = l > c ? l : c,
						b = l > c ? 1 : l / c,
						y = l > c ? c / l : 1;
					(t.translate(o, h), t.rotate(p), t.scale(b, y), t.arc(0, 0, _, f, f + d, 1 - g), t.scale(1 / b, 1 / y), t.rotate(-p), t.translate(-o, -h));
					break;
				case 'z':
					((i = !0), t.closePath());
					break;
			}
		}
		!i && !this.hasFill() ? t.strokeShape(this) : t.fillStrokeShape(this);
	}
	getSelfRect() {
		let t = [];
		this.dataArray.forEach(function (h) {
			if (h.command === 'A') {
				const l = h.points[4],
					c = h.points[5],
					f = h.points[4] + c;
				let d = Math.PI / 180;
				if ((Math.abs(l - f) < d && (d = Math.abs(l - f)), c < 0))
					for (let p = l - d; p > f; p -= d) {
						const g = q.getPointOnEllipticalArc(h.points[0], h.points[1], h.points[2], h.points[3], p, 0);
						t.push(g.x, g.y);
					}
				else
					for (let p = l + d; p < f; p += d) {
						const g = q.getPointOnEllipticalArc(h.points[0], h.points[1], h.points[2], h.points[3], p, 0);
						t.push(g.x, g.y);
					}
			} else if (h.command === 'C')
				for (let l = 0; l <= 1; l += 0.01) {
					const c = q.getPointOnCubicBezier(l, h.start.x, h.start.y, h.points[0], h.points[1], h.points[2], h.points[3], h.points[4], h.points[5]);
					t.push(c.x, c.y);
				}
			else t = t.concat(h.points);
		});
		let e = t[0],
			i = t[0],
			n = t[1],
			r = t[1],
			a,
			o;
		for (let h = 0; h < t.length / 2; h++)
			((a = t[h * 2]),
				(o = t[h * 2 + 1]),
				isNaN(a) || ((e = Math.min(e, a)), (i = Math.max(i, a))),
				isNaN(o) || ((n = Math.min(n, o)), (r = Math.max(r, o))));
		return { x: e, y: n, width: i - e, height: r - n };
	}
	getLength() {
		return this.pathLength;
	}
	getPointAtLength(t) {
		return q.getPointAtLengthOfDataArray(t, this.dataArray);
	}
	static getLineLength(t, e, i, n) {
		return Math.sqrt((i - t) * (i - t) + (n - e) * (n - e));
	}
	static getPathLength(t) {
		let e = 0;
		for (let i = 0; i < t.length; ++i) e += t[i].pathLength;
		return e;
	}
	static getPointAtLengthOfDataArray(t, e) {
		let i,
			n = 0,
			r = e.length;
		if (!r) return null;
		for (; n < r && t > e[n].pathLength; ) ((t -= e[n].pathLength), ++n);
		if (n === r) return ((i = e[n - 1].points.slice(-2)), { x: i[0], y: i[1] });
		if (t < 0.01) return e[n].command === 'M' ? ((i = e[n].points.slice(0, 2)), { x: i[0], y: i[1] }) : { x: e[n].start.x, y: e[n].start.y };
		const a = e[n],
			o = a.points;
		switch (a.command) {
			case 'L':
				return q.getPointOnLine(t, a.start.x, a.start.y, o[0], o[1]);
			case 'C':
				return q.getPointOnCubicBezier(
					ti(t, q.getPathLength(e), (_) => Je([a.start.x, o[0], o[2], o[4]], [a.start.y, o[1], o[3], o[5]], _)),
					a.start.x,
					a.start.y,
					o[0],
					o[1],
					o[2],
					o[3],
					o[4],
					o[5]
				);
			case 'Q':
				return q.getPointOnQuadraticBezier(
					ti(t, q.getPathLength(e), (_) => Ze([a.start.x, o[0], o[2]], [a.start.y, o[1], o[3]], _)),
					a.start.x,
					a.start.y,
					o[0],
					o[1],
					o[2],
					o[3]
				);
			case 'A':
				const h = o[0],
					l = o[1],
					c = o[2],
					f = o[3],
					d = o[5],
					p = o[6];
				let g = o[4];
				return ((g += (d * t) / a.pathLength), q.getPointOnEllipticalArc(h, l, c, f, g, p));
		}
		return null;
	}
	static getPointOnLine(t, e, i, n, r, a, o) {
		((a = a ?? e), (o = o ?? i));
		const h = this.getLineLength(e, i, n, r);
		if (h < 1e-10) return { x: e, y: i };
		if (n === e) return { x: a, y: o + (r > i ? t : -t) };
		const l = (r - i) / (n - e),
			c = Math.sqrt((t * t) / (1 + l * l)) * (n < e ? -1 : 1),
			f = l * c;
		if (Math.abs(o - i - l * (a - e)) < 1e-10) return { x: a + c, y: o + f };
		const d = ((a - e) * (n - e) + (o - i) * (r - i)) / (h * h),
			p = e + d * (n - e),
			g = i + d * (r - i),
			_ = this.getLineLength(a, o, p, g),
			b = Math.sqrt(t * t - _ * _),
			y = Math.sqrt((b * b) / (1 + l * l)) * (n < e ? -1 : 1),
			S = l * y;
		return { x: p + y, y: g + S };
	}
	static getPointOnCubicBezier(t, e, i, n, r, a, o, h, l) {
		function c(b) {
			return b * b * b;
		}
		function f(b) {
			return 3 * b * b * (1 - b);
		}
		function d(b) {
			return 3 * b * (1 - b) * (1 - b);
		}
		function p(b) {
			return (1 - b) * (1 - b) * (1 - b);
		}
		const g = h * c(t) + a * f(t) + n * d(t) + e * p(t),
			_ = l * c(t) + o * f(t) + r * d(t) + i * p(t);
		return { x: g, y: _ };
	}
	static getPointOnQuadraticBezier(t, e, i, n, r, a, o) {
		function h(p) {
			return p * p;
		}
		function l(p) {
			return 2 * p * (1 - p);
		}
		function c(p) {
			return (1 - p) * (1 - p);
		}
		const f = a * h(t) + n * l(t) + e * c(t),
			d = o * h(t) + r * l(t) + i * c(t);
		return { x: f, y: d };
	}
	static getPointOnEllipticalArc(t, e, i, n, r, a) {
		const o = Math.cos(a),
			h = Math.sin(a),
			l = { x: i * Math.cos(r), y: n * Math.sin(r) };
		return { x: t + (l.x * o - l.y * h), y: e + (l.x * h + l.y * o) };
	}
	static parsePathData(t) {
		if (!t) return [];
		let e = t;
		const i = ['m', 'M', 'l', 'L', 'v', 'V', 'h', 'H', 'z', 'Z', 'c', 'C', 'q', 'Q', 't', 'T', 's', 'S', 'a', 'A'];
		e = e.replace(new RegExp(' ', 'g'), ',');
		for (let f = 0; f < i.length; f++) e = e.replace(new RegExp(i[f], 'g'), '|' + i[f]);
		const n = e.split('|'),
			r = [],
			a = [];
		let o = 0,
			h = 0;
		const l = /([-+]?((\d+\.\d+)|((\d+)|(\.\d+)))(?:e[-+]?\d+)?)/gi;
		let c;
		for (let f = 1; f < n.length; f++) {
			let d = n[f],
				p = d.charAt(0);
			for (d = d.slice(1), a.length = 0; (c = l.exec(d)); ) a.push(c[0]);
			let g = [],
				_ = p === 'A' || p === 'a' ? 0 : -1;
			for (let b = 0, y = a.length; b < y; b++) {
				const S = a[b];
				if (S === '00') {
					(g.push(0, 0), _ >= 0 && ((_ += 2), _ >= 7 && (_ -= 7)));
					continue;
				}
				if (_ >= 0) {
					if (_ === 3) {
						if (/^[01]{2}\d+(?:\.\d+)?$/.test(S)) {
							(g.push(parseInt(S[0], 10)), g.push(parseInt(S[1], 10)), g.push(parseFloat(S.slice(2))), (_ += 3), _ >= 7 && (_ -= 7));
							continue;
						}
						if (S === '11' || S === '10' || S === '01') {
							(g.push(parseInt(S[0], 10)), g.push(parseInt(S[1], 10)), (_ += 2), _ >= 7 && (_ -= 7));
							continue;
						}
						if (S === '0' || S === '1') {
							(g.push(parseInt(S, 10)), (_ += 1), _ >= 7 && (_ -= 7));
							continue;
						}
					} else if (_ === 4) {
						if (/^[01]\d+(?:\.\d+)?$/.test(S)) {
							(g.push(parseInt(S[0], 10)), g.push(parseFloat(S.slice(1))), (_ += 2), _ >= 7 && (_ -= 7));
							continue;
						}
						if (S === '0' || S === '1') {
							(g.push(parseInt(S, 10)), (_ += 1), _ >= 7 && (_ -= 7));
							continue;
						}
					}
					const C = parseFloat(S);
					(isNaN(C) ? g.push(0) : g.push(C), (_ += 1), _ >= 7 && (_ -= 7));
				} else {
					const C = parseFloat(S);
					isNaN(C) ? g.push(0) : g.push(C);
				}
			}
			for (; g.length > 0 && !isNaN(g[0]); ) {
				let b = '',
					y = [];
				const S = o,
					C = h;
				let v, G, k, O, M, L, N, B, I, H;
				switch (p) {
					case 'l':
						((o += g.shift()), (h += g.shift()), (b = 'L'), y.push(o, h));
						break;
					case 'L':
						((o = g.shift()), (h = g.shift()), y.push(o, h));
						break;
					case 'm':
						const R = g.shift(),
							w = g.shift();
						if (((o += R), (h += w), (b = 'M'), r.length > 2 && r[r.length - 1].command === 'z')) {
							for (let T = r.length - 2; T >= 0; T--)
								if (r[T].command === 'M') {
									((o = r[T].points[0] + R), (h = r[T].points[1] + w));
									break;
								}
						}
						(y.push(o, h), (p = 'l'));
						break;
					case 'M':
						((o = g.shift()), (h = g.shift()), (b = 'M'), y.push(o, h), (p = 'L'));
						break;
					case 'h':
						((o += g.shift()), (b = 'L'), y.push(o, h));
						break;
					case 'H':
						((o = g.shift()), (b = 'L'), y.push(o, h));
						break;
					case 'v':
						((h += g.shift()), (b = 'L'), y.push(o, h));
						break;
					case 'V':
						((h = g.shift()), (b = 'L'), y.push(o, h));
						break;
					case 'C':
						(y.push(g.shift(), g.shift(), g.shift(), g.shift()), (o = g.shift()), (h = g.shift()), y.push(o, h));
						break;
					case 'c':
						(y.push(o + g.shift(), h + g.shift(), o + g.shift(), h + g.shift()), (o += g.shift()), (h += g.shift()), (b = 'C'), y.push(o, h));
						break;
					case 'S':
						((G = o),
							(k = h),
							(v = r[r.length - 1]),
							v.command === 'C' && ((G = o + (o - v.points[2])), (k = h + (h - v.points[3]))),
							y.push(G, k, g.shift(), g.shift()),
							(o = g.shift()),
							(h = g.shift()),
							(b = 'C'),
							y.push(o, h));
						break;
					case 's':
						((G = o),
							(k = h),
							(v = r[r.length - 1]),
							v.command === 'C' && ((G = o + (o - v.points[2])), (k = h + (h - v.points[3]))),
							y.push(G, k, o + g.shift(), h + g.shift()),
							(o += g.shift()),
							(h += g.shift()),
							(b = 'C'),
							y.push(o, h));
						break;
					case 'Q':
						(y.push(g.shift(), g.shift()), (o = g.shift()), (h = g.shift()), y.push(o, h));
						break;
					case 'q':
						(y.push(o + g.shift(), h + g.shift()), (o += g.shift()), (h += g.shift()), (b = 'Q'), y.push(o, h));
						break;
					case 'T':
						((G = o),
							(k = h),
							(v = r[r.length - 1]),
							v.command === 'Q' && ((G = o + (o - v.points[0])), (k = h + (h - v.points[1]))),
							(o = g.shift()),
							(h = g.shift()),
							(b = 'Q'),
							y.push(G, k, o, h));
						break;
					case 't':
						((G = o),
							(k = h),
							(v = r[r.length - 1]),
							v.command === 'Q' && ((G = o + (o - v.points[0])), (k = h + (h - v.points[1]))),
							(o += g.shift()),
							(h += g.shift()),
							(b = 'Q'),
							y.push(G, k, o, h));
						break;
					case 'A':
						((O = g.shift()),
							(M = g.shift()),
							(L = g.shift()),
							(N = g.shift()),
							(B = g.shift()),
							(I = o),
							(H = h),
							(o = g.shift()),
							(h = g.shift()),
							(b = 'A'),
							(y = this.convertEndpointToCenterParameterization(I, H, o, h, N, B, O, M, L)));
						break;
					case 'a':
						((O = g.shift()),
							(M = g.shift()),
							(L = g.shift()),
							(N = g.shift()),
							(B = g.shift()),
							(I = o),
							(H = h),
							(o += g.shift()),
							(h += g.shift()),
							(b = 'A'),
							(y = this.convertEndpointToCenterParameterization(I, H, o, h, N, B, O, M, L)));
						break;
				}
				r.push({ command: b || p, points: y, start: { x: S, y: C }, pathLength: this.calcLength(S, C, b || p, y) });
			}
			(p === 'z' || p === 'Z') && r.push({ command: 'z', points: [], start: void 0, pathLength: 0 });
		}
		return r;
	}
	static calcLength(t, e, i, n) {
		let r, a, o, h;
		const l = q;
		switch (i) {
			case 'L':
				return l.getLineLength(t, e, n[0], n[1]);
			case 'C':
				return Je([t, n[0], n[2], n[4]], [e, n[1], n[3], n[5]], 1);
			case 'Q':
				return Ze([t, n[0], n[2]], [e, n[1], n[3]], 1);
			case 'A':
				r = 0;
				const c = n[4],
					f = n[5],
					d = n[4] + f;
				let p = Math.PI / 180;
				if ((Math.abs(c - d) < p && (p = Math.abs(c - d)), (a = l.getPointOnEllipticalArc(n[0], n[1], n[2], n[3], c, 0)), f < 0))
					for (h = c - p; h > d; h -= p)
						((o = l.getPointOnEllipticalArc(n[0], n[1], n[2], n[3], h, 0)), (r += l.getLineLength(a.x, a.y, o.x, o.y)), (a = o));
				else
					for (h = c + p; h < d; h += p)
						((o = l.getPointOnEllipticalArc(n[0], n[1], n[2], n[3], h, 0)), (r += l.getLineLength(a.x, a.y, o.x, o.y)), (a = o));
				return ((o = l.getPointOnEllipticalArc(n[0], n[1], n[2], n[3], d, 0)), (r += l.getLineLength(a.x, a.y, o.x, o.y)), r);
		}
		return 0;
	}
	static convertEndpointToCenterParameterization(t, e, i, n, r, a, o, h, l) {
		const c = l * (Math.PI / 180),
			f = (Math.cos(c) * (t - i)) / 2 + (Math.sin(c) * (e - n)) / 2,
			d = (-1 * Math.sin(c) * (t - i)) / 2 + (Math.cos(c) * (e - n)) / 2,
			p = (f * f) / (o * o) + (d * d) / (h * h);
		p > 1 && ((o *= Math.sqrt(p)), (h *= Math.sqrt(p)));
		let g = Math.sqrt((o * o * (h * h) - o * o * (d * d) - h * h * (f * f)) / (o * o * (d * d) + h * h * (f * f)));
		(r === a && (g *= -1), isNaN(g) && (g = 0));
		const _ = (g * o * d) / h,
			b = (g * -h * f) / o,
			y = (t + i) / 2 + Math.cos(c) * _ - Math.sin(c) * b,
			S = (e + n) / 2 + Math.sin(c) * _ + Math.cos(c) * b,
			C = function (N) {
				return Math.sqrt(N[0] * N[0] + N[1] * N[1]);
			},
			v = function (N, B) {
				return (N[0] * B[0] + N[1] * B[1]) / (C(N) * C(B));
			},
			G = function (N, B) {
				return (N[0] * B[1] < N[1] * B[0] ? -1 : 1) * Math.acos(v(N, B));
			},
			k = G([1, 0], [(f - _) / o, (d - b) / h]),
			O = [(f - _) / o, (d - b) / h],
			M = [(-1 * f - _) / o, (-1 * d - b) / h];
		let L = G(O, M);
		return (
			v(O, M) <= -1 && (L = Math.PI),
			v(O, M) >= 1 && (L = 0),
			a === 0 && L > 0 && (L = L - 2 * Math.PI),
			a === 1 && L < 0 && (L = L + 2 * Math.PI),
			[y, S, o, h, k, L, c, a]
		);
	}
}
q.prototype.className = 'Path';
q.prototype._attrsAffectingSize = ['data'];
K(q);
u.addGetterSetter(q, 'data');
class Ct extends ht {
	_sceneFunc(t) {
		super._sceneFunc(t);
		const e = Math.PI * 2,
			i = this.points();
		let n = i;
		const r = this.tension() !== 0 && i.length > 4;
		r && (n = this.getTensionPoints());
		const a = this.pointerLength(),
			o = i.length;
		let h, l;
		if (r) {
			const d = [n[n.length - 4], n[n.length - 3], n[n.length - 2], n[n.length - 1], i[o - 2], i[o - 1]],
				p = q.calcLength(n[n.length - 4], n[n.length - 3], 'C', d),
				g = q.getPointOnQuadraticBezier(Math.min(1, 1 - a / p), d[0], d[1], d[2], d[3], d[4], d[5]);
			((h = i[o - 2] - g.x), (l = i[o - 1] - g.y));
		} else ((h = i[o - 2] - i[o - 4]), (l = i[o - 1] - i[o - 3]));
		const c = (Math.atan2(l, h) + e) % e,
			f = this.pointerWidth();
		(this.pointerAtEnding() &&
			(t.save(),
			t.beginPath(),
			t.translate(i[o - 2], i[o - 1]),
			t.rotate(c),
			t.moveTo(0, 0),
			t.lineTo(-a, f / 2),
			t.lineTo(-a, -f / 2),
			t.closePath(),
			t.restore(),
			this.__fillStroke(t)),
			this.pointerAtBeginning() &&
				(t.save(),
				t.beginPath(),
				t.translate(i[0], i[1]),
				r ? ((h = (n[0] + n[2]) / 2 - i[0]), (l = (n[1] + n[3]) / 2 - i[1])) : ((h = i[2] - i[0]), (l = i[3] - i[1])),
				t.rotate((Math.atan2(-l, -h) + e) % e),
				t.moveTo(0, 0),
				t.lineTo(-a, f / 2),
				t.lineTo(-a, -f / 2),
				t.closePath(),
				t.restore(),
				this.__fillStroke(t)));
	}
	__fillStroke(t) {
		const e = this.dashEnabled();
		(e && ((this.attrs.dashEnabled = !1), t.setLineDash([])), t.fillStrokeShape(this), e && (this.attrs.dashEnabled = !0));
	}
	getSelfRect() {
		const t = super.getSelfRect(),
			e = this.pointerWidth() / 2;
		return { x: t.x, y: t.y - e, width: t.width, height: t.height + e * 2 };
	}
}
Ct.prototype.className = 'Arrow';
K(Ct);
u.addGetterSetter(Ct, 'pointerLength', 10, P());
u.addGetterSetter(Ct, 'pointerWidth', 10, P());
u.addGetterSetter(Ct, 'pointerAtBeginning', !1);
u.addGetterSetter(Ct, 'pointerAtEnding', !0);
class At extends x {
	_sceneFunc(t) {
		(t.beginPath(), t.arc(0, 0, this.attrs.radius || 0, 0, Math.PI * 2, !1), t.closePath(), t.fillStrokeShape(this));
	}
	getWidth() {
		return this.radius() * 2;
	}
	getHeight() {
		return this.radius() * 2;
	}
	setWidth(t) {
		this.radius() !== t / 2 && this.radius(t / 2);
	}
	setHeight(t) {
		this.radius() !== t / 2 && this.radius(t / 2);
	}
}
At.prototype._centroid = !0;
At.prototype.className = 'Circle';
At.prototype._attrsAffectingSize = ['radius'];
K(At);
u.addGetterSetter(At, 'radius', 0, P());
class gt extends x {
	_sceneFunc(t) {
		const e = this.radiusX(),
			i = this.radiusY();
		(t.beginPath(), t.save(), e !== i && t.scale(1, i / e), t.arc(0, 0, e, 0, Math.PI * 2, !1), t.restore(), t.closePath(), t.fillStrokeShape(this));
	}
	getWidth() {
		return this.radiusX() * 2;
	}
	getHeight() {
		return this.radiusY() * 2;
	}
	setWidth(t) {
		this.radiusX(t / 2);
	}
	setHeight(t) {
		this.radiusY(t / 2);
	}
}
gt.prototype.className = 'Ellipse';
gt.prototype._centroid = !0;
gt.prototype._attrsAffectingSize = ['radiusX', 'radiusY'];
K(gt);
u.addComponentsGetterSetter(gt, 'radius', ['x', 'y']);
u.addGetterSetter(gt, 'radiusX', 0, P());
u.addGetterSetter(gt, 'radiusY', 0, P());
class it extends x {
	constructor(t) {
		(super(t),
			(this._loadListener = () => {
				this._requestDraw();
			}),
			this.on('imageChange.konva', (e) => {
				(this._removeImageLoad(e.oldVal), this._setImageLoad());
			}),
			this._setImageLoad());
	}
	_setImageLoad() {
		const t = this.image();
		(t && t.complete) || (t && t.readyState === 4) || (t && t.addEventListener && t.addEventListener('load', this._loadListener));
	}
	_removeImageLoad(t) {
		t && t.removeEventListener && t.removeEventListener('load', this._loadListener);
	}
	destroy() {
		return (this._removeImageLoad(this.image()), super.destroy(), this);
	}
	_useBufferCanvas() {
		const t = !!this.cornerRadius(),
			e = this.hasShadow();
		return t && e ? !0 : super._useBufferCanvas(!0);
	}
	_sceneFunc(t) {
		const e = this.getWidth(),
			i = this.getHeight(),
			n = this.cornerRadius(),
			r = this.attrs.image;
		let a;
		if (r) {
			const o = this.attrs.cropWidth,
				h = this.attrs.cropHeight;
			o && h ? (a = [r, this.cropX(), this.cropY(), o, h, 0, 0, e, i]) : (a = [r, 0, 0, e, i]);
		}
		((this.hasFill() || this.hasStroke() || n) &&
			(t.beginPath(), n ? m.drawRoundedRectPath(t, e, i, n) : t.rect(0, 0, e, i), t.closePath(), t.fillStrokeShape(this)),
			r && (n && t.clip(), t.drawImage.apply(t, a)));
	}
	_hitFunc(t) {
		const e = this.width(),
			i = this.height(),
			n = this.cornerRadius();
		(t.beginPath(), n ? m.drawRoundedRectPath(t, e, i, n) : t.rect(0, 0, e, i), t.closePath(), t.fillStrokeShape(this));
	}
	getWidth() {
		var t, e, i;
		return (i = (t = this.attrs.width) !== null && t !== void 0 ? t : (e = this.image()) === null || e === void 0 ? void 0 : e.width) !== null &&
			i !== void 0
			? i
			: 0;
	}
	getHeight() {
		var t, e, i;
		return (i = (t = this.attrs.height) !== null && t !== void 0 ? t : (e = this.image()) === null || e === void 0 ? void 0 : e.height) !== null &&
			i !== void 0
			? i
			: 0;
	}
	static fromURL(t, e, i = null) {
		const n = m.createImageElement();
		((n.onload = function () {
			const r = new it({ image: n });
			e(r);
		}),
			(n.onerror = i),
			(n.crossOrigin = 'Anonymous'),
			(n.src = t));
	}
}
it.prototype.className = 'Image';
it.prototype._attrsAffectingSize = ['image'];
K(it);
u.addGetterSetter(it, 'cornerRadius', 0, he(4));
u.addGetterSetter(it, 'image');
u.addComponentsGetterSetter(it, 'crop', ['x', 'y', 'width', 'height']);
u.addGetterSetter(it, 'cropX', 0, P());
u.addGetterSetter(it, 'cropY', 0, P());
u.addGetterSetter(it, 'cropWidth', 0, P());
u.addGetterSetter(it, 'cropHeight', 0, P());
const Ai = [
		'fontFamily',
		'fontSize',
		'fontStyle',
		'padding',
		'lineHeight',
		'text',
		'width',
		'height',
		'pointerDirection',
		'pointerWidth',
		'pointerHeight'
	],
	rs = 'Change.konva',
	as = 'none',
	we = 'up',
	Te = 'right',
	Ee = 'down',
	Pe = 'left',
	os = Ai.length;
class Le extends kt {
	constructor(t) {
		(super(t),
			this.on('add.konva', function (e) {
				(this._addListeners(e.child), this._sync());
			}));
	}
	getText() {
		return this.find('Text')[0];
	}
	getTag() {
		return this.find('Tag')[0];
	}
	_addListeners(t) {
		let e = this,
			i;
		const n = function () {
			e._sync();
		};
		for (i = 0; i < os; i++) t.on(Ai[i] + rs, n);
	}
	getWidth() {
		return this.getText().width();
	}
	getHeight() {
		return this.getText().height();
	}
	_sync() {
		let t = this.getText(),
			e = this.getTag(),
			i,
			n,
			r,
			a,
			o,
			h,
			l;
		if (t && e) {
			switch (((i = t.width()), (n = t.height()), (r = e.pointerDirection()), (a = e.pointerWidth()), (l = e.pointerHeight()), (o = 0), (h = 0), r)) {
				case we:
					((o = i / 2), (h = -1 * l));
					break;
				case Te:
					((o = i + a), (h = n / 2));
					break;
				case Ee:
					((o = i / 2), (h = n + l));
					break;
				case Pe:
					((o = -1 * a), (h = n / 2));
					break;
			}
			(e.setAttrs({ x: -1 * o, y: -1 * h, width: i, height: n }), t.setAttrs({ x: -1 * o, y: -1 * h }));
		}
	}
}
Le.prototype.className = 'Label';
K(Le);
class xt extends x {
	_sceneFunc(t) {
		const e = this.width(),
			i = this.height(),
			n = this.pointerDirection(),
			r = this.pointerWidth(),
			a = this.pointerHeight(),
			o = this.cornerRadius();
		let h = 0,
			l = 0,
			c = 0,
			f = 0;
		(typeof o == 'number'
			? (h = l = c = f = Math.min(o, e / 2, i / 2))
			: ((h = Math.min(o[0] || 0, e / 2, i / 2)),
				(l = Math.min(o[1] || 0, e / 2, i / 2)),
				(f = Math.min(o[2] || 0, e / 2, i / 2)),
				(c = Math.min(o[3] || 0, e / 2, i / 2))),
			t.beginPath(),
			t.moveTo(h, 0),
			n === we && (t.lineTo((e - r) / 2, 0), t.lineTo(e / 2, -1 * a), t.lineTo((e + r) / 2, 0)),
			t.lineTo(e - l, 0),
			t.arc(e - l, l, l, (Math.PI * 3) / 2, 0, !1),
			n === Te && (t.lineTo(e, (i - a) / 2), t.lineTo(e + r, i / 2), t.lineTo(e, (i + a) / 2)),
			t.lineTo(e, i - f),
			t.arc(e - f, i - f, f, 0, Math.PI / 2, !1),
			n === Ee && (t.lineTo((e + r) / 2, i), t.lineTo(e / 2, i + a), t.lineTo((e - r) / 2, i)),
			t.lineTo(c, i),
			t.arc(c, i - c, c, Math.PI / 2, Math.PI, !1),
			n === Pe && (t.lineTo(0, (i + a) / 2), t.lineTo(-1 * r, i / 2), t.lineTo(0, (i - a) / 2)),
			t.lineTo(0, h),
			t.arc(h, h, h, Math.PI, (Math.PI * 3) / 2, !1),
			t.closePath(),
			t.fillStrokeShape(this));
	}
	getSelfRect() {
		let t = 0,
			e = 0,
			i = this.pointerWidth(),
			n = this.pointerHeight(),
			r = this.pointerDirection(),
			a = this.width(),
			o = this.height();
		return (
			r === we ? ((e -= n), (o += n)) : r === Ee ? (o += n) : r === Pe ? ((t -= i * 1.5), (a += i)) : r === Te && (a += i * 1.5),
			{ x: t, y: e, width: a, height: o }
		);
	}
}
xt.prototype.className = 'Tag';
K(xt);
u.addGetterSetter(xt, 'pointerDirection', as);
u.addGetterSetter(xt, 'pointerWidth', 0, P());
u.addGetterSetter(xt, 'pointerHeight', 0, P());
u.addGetterSetter(xt, 'cornerRadius', 0, he(4));
class qt extends x {
	_sceneFunc(t) {
		const e = this.cornerRadius(),
			i = this.width(),
			n = this.height();
		(t.beginPath(), e ? m.drawRoundedRectPath(t, i, n, e) : t.rect(0, 0, i, n), t.closePath(), t.fillStrokeShape(this));
	}
}
qt.prototype.className = 'Rect';
K(qt);
u.addGetterSetter(qt, 'cornerRadius', 0, he(4));
class pt extends x {
	_sceneFunc(t) {
		const e = this._getPoints(),
			i = this.radius(),
			n = this.sides(),
			r = this.cornerRadius();
		if ((t.beginPath(), r)) m.drawRoundedPolygonPath(t, e, n, i, r);
		else {
			t.moveTo(e[0].x, e[0].y);
			for (let a = 1; a < e.length; a++) t.lineTo(e[a].x, e[a].y);
		}
		(t.closePath(), t.fillStrokeShape(this));
	}
	_getPoints() {
		const t = this.attrs.sides,
			e = this.attrs.radius || 0,
			i = [];
		for (let n = 0; n < t; n++) i.push({ x: e * Math.sin((n * 2 * Math.PI) / t), y: -1 * e * Math.cos((n * 2 * Math.PI) / t) });
		return i;
	}
	getSelfRect() {
		const t = this._getPoints();
		let e = t[0].x,
			i = t[0].x,
			n = t[0].y,
			r = t[0].y;
		return (
			t.forEach((a) => {
				((e = Math.min(e, a.x)), (i = Math.max(i, a.x)), (n = Math.min(n, a.y)), (r = Math.max(r, a.y)));
			}),
			{ x: e, y: n, width: i - e, height: r - n }
		);
	}
	getWidth() {
		return this.radius() * 2;
	}
	getHeight() {
		return this.radius() * 2;
	}
	setWidth(t) {
		this.radius(t / 2);
	}
	setHeight(t) {
		this.radius(t / 2);
	}
}
pt.prototype.className = 'RegularPolygon';
pt.prototype._centroid = !0;
pt.prototype._attrsAffectingSize = ['radius'];
K(pt);
u.addGetterSetter(pt, 'radius', 0, P());
u.addGetterSetter(pt, 'sides', 0, P());
u.addGetterSetter(pt, 'cornerRadius', 0, he(4));
const ei = Math.PI * 2;
class wt extends x {
	_sceneFunc(t) {
		(t.beginPath(),
			t.arc(0, 0, this.innerRadius(), 0, ei, !1),
			t.moveTo(this.outerRadius(), 0),
			t.arc(0, 0, this.outerRadius(), ei, 0, !0),
			t.closePath(),
			t.fillStrokeShape(this));
	}
	getWidth() {
		return this.outerRadius() * 2;
	}
	getHeight() {
		return this.outerRadius() * 2;
	}
	setWidth(t) {
		this.outerRadius(t / 2);
	}
	setHeight(t) {
		this.outerRadius(t / 2);
	}
}
wt.prototype.className = 'Ring';
wt.prototype._centroid = !0;
wt.prototype._attrsAffectingSize = ['innerRadius', 'outerRadius'];
K(wt);
u.addGetterSetter(wt, 'innerRadius', 0, P());
u.addGetterSetter(wt, 'outerRadius', 0, P());
class rt extends x {
	constructor(t) {
		(super(t),
			(this._updated = !0),
			(this.anim = new nt(() => {
				const e = this._updated;
				return ((this._updated = !1), e);
			})),
			this.on('animationChange.konva', function () {
				this.frameIndex(0);
			}),
			this.on('frameIndexChange.konva', function () {
				this._updated = !0;
			}),
			this.on('frameRateChange.konva', function () {
				this.anim.isRunning() && (clearInterval(this.interval), this._setInterval());
			}));
	}
	_sceneFunc(t) {
		const e = this.animation(),
			i = this.frameIndex(),
			n = i * 4,
			r = this.animations()[e],
			a = this.frameOffsets(),
			o = r[n + 0],
			h = r[n + 1],
			l = r[n + 2],
			c = r[n + 3],
			f = this.image();
		if (((this.hasFill() || this.hasStroke()) && (t.beginPath(), t.rect(0, 0, l, c), t.closePath(), t.fillStrokeShape(this)), f))
			if (a) {
				const d = a[e],
					p = i * 2;
				t.drawImage(f, o, h, l, c, d[p + 0], d[p + 1], l, c);
			} else t.drawImage(f, o, h, l, c, 0, 0, l, c);
	}
	_hitFunc(t) {
		const e = this.animation(),
			i = this.frameIndex(),
			n = i * 4,
			r = this.animations()[e],
			a = this.frameOffsets(),
			o = r[n + 2],
			h = r[n + 3];
		if ((t.beginPath(), a)) {
			const l = a[e],
				c = i * 2;
			t.rect(l[c + 0], l[c + 1], o, h);
		} else t.rect(0, 0, o, h);
		(t.closePath(), t.fillShape(this));
	}
	_useBufferCanvas() {
		return super._useBufferCanvas(!0);
	}
	_setInterval() {
		const t = this;
		this.interval = setInterval(function () {
			t._updateIndex();
		}, 1e3 / this.frameRate());
	}
	start() {
		if (this.isRunning()) return;
		const t = this.getLayer();
		(this.anim.setLayers(t), this._setInterval(), this.anim.start());
	}
	stop() {
		(this.anim.stop(), clearInterval(this.interval));
	}
	isRunning() {
		return this.anim.isRunning();
	}
	_updateIndex() {
		const t = this.frameIndex(),
			e = this.animation(),
			i = this.animations(),
			n = i[e],
			r = n.length / 4;
		t < r - 1 ? this.frameIndex(t + 1) : this.frameIndex(0);
	}
}
rt.prototype.className = 'Sprite';
K(rt);
u.addGetterSetter(rt, 'animation');
u.addGetterSetter(rt, 'animations');
u.addGetterSetter(rt, 'frameOffsets');
u.addGetterSetter(rt, 'image');
u.addGetterSetter(rt, 'frameIndex', 0, P());
u.addGetterSetter(rt, 'frameRate', 17, P());
u.backCompat(rt, { index: 'frameIndex', getIndex: 'getFrameIndex', setIndex: 'setFrameIndex' });
class mt extends x {
	_sceneFunc(t) {
		const e = this.innerRadius(),
			i = this.outerRadius(),
			n = this.numPoints();
		(t.beginPath(), t.moveTo(0, 0 - i));
		for (let r = 1; r < n * 2; r++) {
			const a = r % 2 === 0 ? i : e,
				o = a * Math.sin((r * Math.PI) / n),
				h = -1 * a * Math.cos((r * Math.PI) / n);
			t.lineTo(o, h);
		}
		(t.closePath(), t.fillStrokeShape(this));
	}
	getWidth() {
		return this.outerRadius() * 2;
	}
	getHeight() {
		return this.outerRadius() * 2;
	}
	setWidth(t) {
		this.outerRadius(t / 2);
	}
	setHeight(t) {
		this.outerRadius(t / 2);
	}
}
mt.prototype.className = 'Star';
mt.prototype._centroid = !0;
mt.prototype._attrsAffectingSize = ['innerRadius', 'outerRadius'];
K(mt);
u.addGetterSetter(mt, 'numPoints', 5, P());
u.addGetterSetter(mt, 'innerRadius', 0, P());
u.addGetterSetter(mt, 'outerRadius', 0, P());
function dt(s) {
	return [...s].reduce((t, e, i, n) => {
		if (/\p{Emoji}/u.test(e)) {
			const r = n[i + 1];
			r && /\p{Emoji_Modifier}|\u200D/u.test(r) ? (t.push(e + r), (n[i + 1] = '')) : t.push(e);
		} else
			/\p{Regional_Indicator}{2}/u.test(e + (n[i + 1] || ''))
				? t.push(e + n[i + 1])
				: i > 0 && /\p{Mn}|\p{Me}|\p{Mc}/u.test(e)
					? (t[t.length - 1] += e)
					: e && t.push(e);
		return t;
	}, []);
}
const Et = 'auto',
	hs = 'center',
	Ri = 'inherit',
	It = 'justify',
	ls = 'Change.konva',
	cs = '2d',
	ii = '-',
	Mi = 'left',
	ds = 'text',
	fs = 'Text',
	us = 'top',
	gs = 'bottom',
	ni = 'middle',
	Gi = 'normal',
	ps = 'px ',
	ee = ' ',
	ms = 'right',
	si = 'rtl',
	_s = 'word',
	ys = 'char',
	ri = 'none',
	pe = '…',
	Oi = [
		'direction',
		'fontFamily',
		'fontSize',
		'fontStyle',
		'fontVariant',
		'padding',
		'align',
		'verticalAlign',
		'lineHeight',
		'text',
		'width',
		'height',
		'wrap',
		'ellipsis',
		'letterSpacing'
	],
	Ss = Oi.length;
function bs(s) {
	return s
		.split(',')
		.map((t) => {
			t = t.trim();
			const e = t.indexOf(' ') >= 0,
				i = t.indexOf('"') >= 0 || t.indexOf("'") >= 0;
			return (e && !i && (t = `"${t}"`), t);
		})
		.join(', ');
}
let ie;
function me() {
	return ie || ((ie = m.createCanvasElement().getContext(cs)), ie);
}
function vs(s) {
	s.fillText(this._partialText, this._partialTextX, this._partialTextY);
}
function Cs(s) {
	(s.setAttr('miterLimit', 2), s.strokeText(this._partialText, this._partialTextX, this._partialTextY));
}
function xs(s) {
	return (
		(s = s || {}),
		!s.fillLinearGradientColorStops && !s.fillRadialGradientColorStops && !s.fillPatternImage && (s.fill = s.fill || 'black'),
		s
	);
}
class j extends x {
	constructor(t) {
		(super(xs(t)), (this._partialTextX = 0), (this._partialTextY = 0));
		for (let e = 0; e < Ss; e++) this.on(Oi[e] + ls, this._setTextData);
		this._setTextData();
	}
	_sceneFunc(t) {
		var e, i;
		const n = this.textArr,
			r = n.length;
		if (!this.text()) return;
		let a = this.padding(),
			o = this.fontSize(),
			h = this.lineHeight() * o,
			l = this.verticalAlign(),
			c = this.direction(),
			f = 0,
			d = this.align(),
			p = this.getWidth(),
			g = this.letterSpacing(),
			_ = this.charRenderFunc(),
			b = this.fill(),
			y = this.textDecoration(),
			S = this.underlineOffset(),
			C = y.indexOf('underline') !== -1,
			v = y.indexOf('line-through') !== -1,
			G;
		c = c === Ri ? t.direction : c;
		let k = h / 2,
			O = ni;
		if (!A.legacyTextRendering) {
			const M = this.measureSize('M');
			O = 'alphabetic';
			const L = (e = M.fontBoundingBoxAscent) !== null && e !== void 0 ? e : M.actualBoundingBoxAscent,
				N = (i = M.fontBoundingBoxDescent) !== null && i !== void 0 ? i : M.actualBoundingBoxDescent;
			k = (L - N) / 2 + h / 2;
		}
		for (
			c === si && t.setAttr('direction', c),
				t.setAttr('font', this._getContextFont()),
				t.setAttr('textBaseline', O),
				t.setAttr('textAlign', Mi),
				l === ni ? (f = (this.getHeight() - r * h - a * 2) / 2) : l === gs && (f = this.getHeight() - r * h - a * 2),
				t.translate(a, f + a),
				G = 0;
			G < r;
			G++
		) {
			let M = 0,
				L = 0;
			const N = n[G],
				B = N.text,
				I = N.width,
				H = N.lastInParagraph;
			if ((t.save(), d === ms ? (M += p - I - a * 2) : d === hs && (M += (p - I - a * 2) / 2), C)) {
				(t.save(), t.beginPath());
				const w = S ?? (A.legacyTextRendering ? Math.round(o / 2) : Math.round(o / 4)),
					T = M,
					W = k + L + w;
				t.moveTo(T, W);
				const D = d === It && !H ? p - a * 2 : I;
				(t.lineTo(T + Math.round(D), W), (t.lineWidth = o / 15));
				const X = this._getLinearGradient();
				((t.strokeStyle = X || b), t.stroke(), t.restore());
			}
			const R = M;
			if (c !== si && (g !== 0 || d === It || _)) {
				const w = B.split(' ').length - 1,
					T = dt(B);
				for (let W = 0; W < T.length; W++) {
					const D = T[W];
					if (
						(D === ' ' && !H && d === It && (M += (p - a * 2 - I) / w),
						(this._partialTextX = M),
						(this._partialTextY = k + L),
						(this._partialText = D),
						_)
					) {
						t.save();
						const Q = n.slice(0, G).reduce(($, Z) => $ + dt(Z.text).length, 0),
							Y = W + Q;
						_({ char: D, index: Y, x: M, y: k + L, lineIndex: G, column: W, isLastInLine: H, width: this.measureSize(D).width, context: t });
					}
					(t.fillStrokeShape(this), _ && t.restore(), (M += this.measureSize(D).width + g));
				}
			} else
				(g !== 0 && t.setAttr('letterSpacing', `${g}px`),
					(this._partialTextX = M),
					(this._partialTextY = k + L),
					(this._partialText = B),
					t.fillStrokeShape(this));
			if (v) {
				(t.save(), t.beginPath());
				const w = A.legacyTextRendering ? 0 : -Math.round(o / 4),
					T = R;
				t.moveTo(T, k + L + w);
				const W = d === It && !H ? p - a * 2 : I;
				(t.lineTo(T + Math.round(W), k + L + w), (t.lineWidth = o / 15));
				const D = this._getLinearGradient();
				((t.strokeStyle = D || b), t.stroke(), t.restore());
			}
			(t.restore(), r > 1 && (k += h));
		}
	}
	_hitFunc(t) {
		const e = this.getWidth(),
			i = this.getHeight();
		(t.beginPath(), t.rect(0, 0, e, i), t.closePath(), t.fillStrokeShape(this));
	}
	setText(t) {
		const e = m._isString(t) ? t : t == null ? '' : t + '';
		return (this._setAttr(ds, e), this);
	}
	getWidth() {
		return this.attrs.width === Et || this.attrs.width === void 0 ? this.getTextWidth() + this.padding() * 2 : this.attrs.width;
	}
	getHeight() {
		return this.attrs.height === Et || this.attrs.height === void 0
			? this.fontSize() * this.textArr.length * this.lineHeight() + this.padding() * 2
			: this.attrs.height;
	}
	getTextWidth() {
		return this.textWidth;
	}
	getTextHeight() {
		return (
			m.warn('text.getTextHeight() method is deprecated. Use text.height() - for full height and text.fontSize() - for one line height.'),
			this.textHeight
		);
	}
	measureSize(t) {
		var e, i, n, r, a, o, h, l, c, f, d;
		let p = me(),
			g = this.fontSize(),
			_;
		(p.save(), (p.font = this._getContextFont()), (_ = p.measureText(t)), p.restore());
		const b = g / 100;
		return {
			actualBoundingBoxAscent: (e = _.actualBoundingBoxAscent) !== null && e !== void 0 ? e : 71.58203125 * b,
			actualBoundingBoxDescent: (i = _.actualBoundingBoxDescent) !== null && i !== void 0 ? i : 0,
			actualBoundingBoxLeft: (n = _.actualBoundingBoxLeft) !== null && n !== void 0 ? n : -7.421875 * b,
			actualBoundingBoxRight: (r = _.actualBoundingBoxRight) !== null && r !== void 0 ? r : 75.732421875 * b,
			alphabeticBaseline: (a = _.alphabeticBaseline) !== null && a !== void 0 ? a : 0,
			emHeightAscent: (o = _.emHeightAscent) !== null && o !== void 0 ? o : 100 * b,
			emHeightDescent: (h = _.emHeightDescent) !== null && h !== void 0 ? h : -20 * b,
			fontBoundingBoxAscent: (l = _.fontBoundingBoxAscent) !== null && l !== void 0 ? l : 91 * b,
			fontBoundingBoxDescent: (c = _.fontBoundingBoxDescent) !== null && c !== void 0 ? c : 21 * b,
			hangingBaseline: (f = _.hangingBaseline) !== null && f !== void 0 ? f : 72.80000305175781 * b,
			ideographicBaseline: (d = _.ideographicBaseline) !== null && d !== void 0 ? d : -21 * b,
			width: _.width,
			height: g
		};
	}
	_getContextFont() {
		return this.fontStyle() + ee + this.fontVariant() + ee + (this.fontSize() + ps) + bs(this.fontFamily());
	}
	_addTextLine(t) {
		this.align() === It && (t = t.trim());
		const i = this._getTextWidth(t);
		return this.textArr.push({ text: t, width: i, lastInParagraph: !1 });
	}
	_getTextWidth(t) {
		const e = this.letterSpacing(),
			i = t.length;
		return me().measureText(t).width + e * i;
	}
	_setTextData() {
		let t = this.text().split(`
`),
			e = +this.fontSize(),
			i = 0,
			n = this.lineHeight() * e,
			r = this.attrs.width,
			a = this.attrs.height,
			o = r !== Et && r !== void 0,
			h = a !== Et && a !== void 0,
			l = this.padding(),
			c = r - l * 2,
			f = a - l * 2,
			d = 0,
			p = this.wrap(),
			g = p !== ri,
			_ = p !== ys && g,
			b = this.ellipsis();
		((this.textArr = []), (me().font = this._getContextFont()));
		const y = b ? this._getTextWidth(pe) : 0;
		for (let S = 0, C = t.length; S < C; ++S) {
			let v = t[S],
				G = this._getTextWidth(v);
			if (o && G > c)
				for (; v.length > 0; ) {
					let k = 0,
						O = dt(v).length,
						M = '',
						L = 0;
					for (; k < O; ) {
						const N = (k + O) >>> 1,
							B = dt(v),
							I = B.slice(0, N + 1).join(''),
							H = this._getTextWidth(I);
						(b && h && d + n > f ? H + y : H) <= c ? ((k = N + 1), (M = I), (L = H)) : (O = N);
					}
					if (M) {
						if (_) {
							const I = dt(v),
								H = dt(M),
								R = I[H.length],
								w = R === ee || R === ii;
							let T;
							if (w && L <= c) T = H.length;
							else {
								const W = H.lastIndexOf(ee),
									D = H.lastIndexOf(ii);
								T = Math.max(W, D) + 1;
							}
							T > 0 && ((k = T), (M = I.slice(0, k).join('')), (L = this._getTextWidth(M)));
						}
						if (((M = M.trimRight()), this._addTextLine(M), (i = Math.max(i, L)), (d += n), this._shouldHandleEllipsis(d))) {
							this._tryToAddEllipsisToLastLine();
							break;
						}
						if (((v = dt(v).slice(k).join('').trimLeft()), v.length > 0 && ((G = this._getTextWidth(v)), G <= c))) {
							(this._addTextLine(v), (d += n), (i = Math.max(i, G)));
							break;
						}
					} else break;
				}
			else (this._addTextLine(v), (d += n), (i = Math.max(i, G)), this._shouldHandleEllipsis(d) && S < C - 1 && this._tryToAddEllipsisToLastLine());
			if ((this.textArr[this.textArr.length - 1] && (this.textArr[this.textArr.length - 1].lastInParagraph = !0), h && d + n > f)) break;
		}
		((this.textHeight = e), (this.textWidth = i));
	}
	_shouldHandleEllipsis(t) {
		const e = +this.fontSize(),
			i = this.lineHeight() * e,
			n = this.attrs.height,
			r = n !== Et && n !== void 0,
			a = this.padding(),
			o = n - a * 2;
		return !(this.wrap() !== ri) || (r && t + i > o);
	}
	_tryToAddEllipsisToLastLine() {
		const t = this.attrs.width,
			e = t !== Et && t !== void 0,
			i = this.padding(),
			n = t - i * 2,
			r = this.ellipsis(),
			a = this.textArr[this.textArr.length - 1];
		!a ||
			!r ||
			(e && (this._getTextWidth(a.text + pe) < n || (a.text = a.text.slice(0, a.text.length - 3))),
			this.textArr.splice(this.textArr.length - 1, 1),
			this._addTextLine(a.text + pe));
	}
	getStrokeScaleEnabled() {
		return !0;
	}
	_useBufferCanvas() {
		const t = this.textDecoration().indexOf('underline') !== -1 || this.textDecoration().indexOf('line-through') !== -1,
			e = this.hasShadow();
		return t && e ? !0 : super._useBufferCanvas();
	}
}
j.prototype._fillFunc = vs;
j.prototype._strokeFunc = Cs;
j.prototype.className = fs;
j.prototype._attrsAffectingSize = ['text', 'fontSize', 'padding', 'wrap', 'lineHeight', 'letterSpacing'];
K(j);
u.overWriteSetter(j, 'width', Me());
u.overWriteSetter(j, 'height', Me());
u.addGetterSetter(j, 'direction', Ri);
u.addGetterSetter(j, 'fontFamily', 'Arial');
u.addGetterSetter(j, 'fontSize', 12, P());
u.addGetterSetter(j, 'fontStyle', Gi);
u.addGetterSetter(j, 'fontVariant', Gi);
u.addGetterSetter(j, 'padding', 0, P());
u.addGetterSetter(j, 'align', Mi);
u.addGetterSetter(j, 'verticalAlign', us);
u.addGetterSetter(j, 'lineHeight', 1, P());
u.addGetterSetter(j, 'wrap', _s);
u.addGetterSetter(j, 'ellipsis', !1, st());
u.addGetterSetter(j, 'letterSpacing', 0, P());
u.addGetterSetter(j, 'text', '', bt());
u.addGetterSetter(j, 'textDecoration', '');
u.addGetterSetter(j, 'underlineOffset', void 0, P());
u.addGetterSetter(j, 'charRenderFunc', void 0);
const ws = '',
	Li = 'normal';
function Ii(s) {
	s.fillText(this.partialText, 0, 0);
}
function Di(s) {
	s.strokeText(this.partialText, 0, 0);
}
class J extends x {
	constructor(t) {
		(super(t),
			(this.dummyCanvas = m.createCanvasElement()),
			(this.dataArray = []),
			this._readDataAttribute(),
			this.on('dataChange.konva', function () {
				(this._readDataAttribute(), this._setTextData());
			}),
			this.on(
				'textChange.konva alignChange.konva letterSpacingChange.konva kerningFuncChange.konva fontSizeChange.konva fontFamilyChange.konva',
				this._setTextData
			),
			this._setTextData());
	}
	_getTextPathLength() {
		return q.getPathLength(this.dataArray);
	}
	_getPointAtLength(t) {
		if (!this.attrs.data) return null;
		const e = this.pathLength;
		return t > e ? null : q.getPointAtLengthOfDataArray(t, this.dataArray);
	}
	_readDataAttribute() {
		((this.dataArray = q.parsePathData(this.attrs.data)), (this.pathLength = this._getTextPathLength()));
	}
	_sceneFunc(t) {
		(t.setAttr('font', this._getContextFont()), t.setAttr('textBaseline', this.textBaseline()), t.setAttr('textAlign', 'left'), t.save());
		const e = this.textDecoration(),
			i = this.fill(),
			n = this.fontSize(),
			r = this.glyphInfo,
			a = e.indexOf('underline') !== -1,
			o = e.indexOf('line-through') !== -1;
		a && t.beginPath();
		for (let h = 0; h < r.length; h++) {
			t.save();
			const l = r[h].p0;
			(t.translate(l.x, l.y),
				t.rotate(r[h].rotation),
				(this.partialText = r[h].text),
				t.fillStrokeShape(this),
				a && (h === 0 && t.moveTo(0, n / 2 + 1), t.lineTo(r[h].width, n / 2 + 1)),
				t.restore());
		}
		if ((a && ((t.strokeStyle = i), (t.lineWidth = n / 20), t.stroke()), o)) {
			t.beginPath();
			for (let h = 0; h < r.length; h++) {
				t.save();
				const l = r[h].p0;
				(t.translate(l.x, l.y), t.rotate(r[h].rotation), h === 0 && t.moveTo(0, 0), t.lineTo(r[h].width, 0), t.restore());
			}
			((t.strokeStyle = i), (t.lineWidth = n / 20), t.stroke());
		}
		t.restore();
	}
	_hitFunc(t) {
		t.beginPath();
		const e = this.glyphInfo;
		if (e.length >= 1) {
			const i = e[0].p0;
			t.moveTo(i.x, i.y);
		}
		for (let i = 0; i < e.length; i++) {
			const n = e[i].p1;
			t.lineTo(n.x, n.y);
		}
		(t.setAttr('lineWidth', this.fontSize()), t.setAttr('strokeStyle', this.colorKey), t.stroke());
	}
	getTextWidth() {
		return this.textWidth;
	}
	getTextHeight() {
		return (
			m.warn('text.getTextHeight() method is deprecated. Use text.height() - for full height and text.fontSize() - for one line height.'),
			this.textHeight
		);
	}
	setText(t) {
		return j.prototype.setText.call(this, t);
	}
	_getContextFont() {
		return j.prototype._getContextFont.call(this);
	}
	_getTextSize(t) {
		const i = this.dummyCanvas.getContext('2d');
		(i.save(), (i.font = this._getContextFont()));
		const n = i.measureText(t);
		return (i.restore(), { width: n.width, height: parseInt(`${this.fontSize()}`, 10) });
	}
	_setTextData() {
		const t = dt(this.text()),
			e = [];
		let i = 0;
		for (let f = 0; f < t.length; f++) (e.push({ char: t[f], width: this._getTextSize(t[f]).width }), (i += e[f].width));
		const { height: n } = this._getTextSize(this.attrs.text);
		if (((this.textWidth = i), (this.textHeight = n), (this.glyphInfo = []), !this.attrs.data)) return null;
		const r = this.letterSpacing(),
			a = this.align(),
			o = this.kerningFunc(),
			h = Math.max(this.textWidth + ((this.attrs.text || '').length - 1) * r, 0);
		let l = 0;
		(a === 'center' && (l = Math.max(0, this.pathLength / 2 - h / 2)), a === 'right' && (l = Math.max(0, this.pathLength - h)));
		let c = l;
		for (let f = 0; f < e.length; f++) {
			const d = this._getPointAtLength(c);
			if (!d) return;
			const p = e[f].char;
			let g = e[f].width + r;
			if (p === ' ' && a === 'justify') {
				const v = this.text().split(' ').length - 1;
				g += (this.pathLength - h) / v;
			}
			const _ = this._getPointAtLength(c + g);
			if (!_) return;
			const b = q.getLineLength(d.x, d.y, _.x, _.y);
			let y = 0;
			if (o)
				try {
					y = o(e[f - 1].char, p) * this.fontSize();
				} catch {
					y = 0;
				}
			((d.x += y), (_.x += y), (this.textWidth += y));
			const S = q.getPointOnLine(y + b / 2, d.x, d.y, _.x, _.y),
				C = Math.atan2(_.y - d.y, _.x - d.x);
			(this.glyphInfo.push({ transposeX: S.x, transposeY: S.y, text: t[f], rotation: C, p0: d, p1: _, width: b }), (c += g));
		}
	}
	getSelfRect() {
		if (!this.glyphInfo.length) return { x: 0, y: 0, width: 0, height: 0 };
		const t = [];
		this.glyphInfo.forEach(function (l) {
			(t.push(l.p0.x), t.push(l.p0.y), t.push(l.p1.x), t.push(l.p1.y));
		});
		let e = t[0] || 0,
			i = t[0] || 0,
			n = t[1] || 0,
			r = t[1] || 0,
			a,
			o;
		for (let l = 0; l < t.length / 2; l++)
			((a = t[l * 2]), (o = t[l * 2 + 1]), (e = Math.min(e, a)), (i = Math.max(i, a)), (n = Math.min(n, o)), (r = Math.max(r, o)));
		const h = this.fontSize();
		return { x: e - h / 2, y: n - h / 2, width: i - e + h, height: r - n + h };
	}
	destroy() {
		return (m.releaseCanvas(this.dummyCanvas), super.destroy());
	}
}
J.prototype._fillFunc = Ii;
J.prototype._strokeFunc = Di;
J.prototype._fillFuncHit = Ii;
J.prototype._strokeFuncHit = Di;
J.prototype.className = 'TextPath';
J.prototype._attrsAffectingSize = ['text', 'fontSize', 'data'];
K(J);
u.addGetterSetter(J, 'data');
u.addGetterSetter(J, 'fontFamily', 'Arial');
u.addGetterSetter(J, 'fontSize', 12, P());
u.addGetterSetter(J, 'fontStyle', Li);
u.addGetterSetter(J, 'align', 'left');
u.addGetterSetter(J, 'letterSpacing', 0, P());
u.addGetterSetter(J, 'textBaseline', 'middle');
u.addGetterSetter(J, 'fontVariant', Li);
u.addGetterSetter(J, 'text', ws);
u.addGetterSetter(J, 'textDecoration', '');
u.addGetterSetter(J, 'kerningFunc', void 0);
const Ni = 'tr-konva',
	Ts = [
		'resizeEnabledChange',
		'rotateAnchorOffsetChange',
		'rotateAnchorAngleChange',
		'rotateEnabledChange',
		'enabledAnchorsChange',
		'anchorSizeChange',
		'borderEnabledChange',
		'borderStrokeChange',
		'borderStrokeWidthChange',
		'borderDashChange',
		'anchorStrokeChange',
		'anchorStrokeWidthChange',
		'anchorFillChange',
		'anchorCornerRadiusChange',
		'ignoreStrokeChange',
		'anchorStyleFuncChange'
	]
		.map((s) => s + `.${Ni}`)
		.join(' '),
	ai = 'nodesRect',
	Es = [
		'widthChange',
		'heightChange',
		'scaleXChange',
		'scaleYChange',
		'skewXChange',
		'skewYChange',
		'rotationChange',
		'offsetXChange',
		'offsetYChange',
		'transformsEnabledChange',
		'strokeWidthChange',
		'draggableChange'
	],
	Ps = {
		'top-left': -45,
		'top-center': 0,
		'top-right': 45,
		'middle-right': -90,
		'middle-left': 90,
		'bottom-left': -135,
		'bottom-center': 180,
		'bottom-right': 135
	},
	ks = 'ontouchstart' in A._global;
function As(s, t, e) {
	if (s === 'rotater') return e;
	t += m.degToRad(Ps[s] || 0);
	const i = ((m.radToDeg(t) % 360) + 360) % 360;
	return m._inRange(i, 315 + 22.5, 360) || m._inRange(i, 0, 22.5)
		? 'ns-resize'
		: m._inRange(i, 45 - 22.5, 45 + 22.5)
			? 'nesw-resize'
			: m._inRange(i, 90 - 22.5, 90 + 22.5)
				? 'ew-resize'
				: m._inRange(i, 135 - 22.5, 135 + 22.5)
					? 'nwse-resize'
					: m._inRange(i, 180 - 22.5, 180 + 22.5)
						? 'ns-resize'
						: m._inRange(i, 225 - 22.5, 225 + 22.5)
							? 'nesw-resize'
							: m._inRange(i, 270 - 22.5, 270 + 22.5)
								? 'ew-resize'
								: m._inRange(i, 315 - 22.5, 315 + 22.5)
									? 'nwse-resize'
									: (m.error('Transformer has unknown angle for cursor detection: ' + i), 'pointer');
}
const ae = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right'];
function Rs(s) {
	return {
		x: s.x + (s.width / 2) * Math.cos(s.rotation) + (s.height / 2) * Math.sin(-s.rotation),
		y: s.y + (s.height / 2) * Math.cos(s.rotation) + (s.width / 2) * Math.sin(s.rotation)
	};
}
function Fi(s, t, e) {
	const i = e.x + (s.x - e.x) * Math.cos(t) - (s.y - e.y) * Math.sin(t),
		n = e.y + (s.x - e.x) * Math.sin(t) + (s.y - e.y) * Math.cos(t);
	return { ...s, rotation: s.rotation + t, x: i, y: n };
}
function Ms(s, t) {
	const e = Rs(s);
	return Fi(s, t, e);
}
function Gs(s, t, e) {
	let i = t;
	for (let n = 0; n < s.length; n++) {
		const r = A.getAngle(s[n]),
			a = Math.abs(r - t) % (Math.PI * 2);
		Math.min(a, Math.PI * 2 - a) < e && (i = r);
	}
	return i;
}
let ke = 0;
class F extends kt {
	constructor(t) {
		(super(t),
			(this._movingAnchorName = null),
			(this._transforming = !1),
			this._createElements(),
			(this._handleMouseMove = this._handleMouseMove.bind(this)),
			(this._handleMouseUp = this._handleMouseUp.bind(this)),
			(this.update = this.update.bind(this)),
			this.on(Ts, this.update),
			this.getNode() && this.update());
	}
	attachTo(t) {
		return (this.setNode(t), this);
	}
	setNode(t) {
		return (
			m.warn('tr.setNode(shape), tr.node(shape) and tr.attachTo(shape) methods are deprecated. Please use tr.nodes(nodesArray) instead.'),
			this.setNodes([t])
		);
	}
	getNode() {
		return this._nodes && this._nodes[0];
	}
	_getEventNamespace() {
		return Ni + this._id;
	}
	setNodes(t = []) {
		this._nodes && this._nodes.length && this.detach();
		const e = t.filter((n) =>
			n.isAncestorOf(this) ? (m.error('Konva.Transformer cannot be an a child of the node you are trying to attach'), !1) : !0
		);
		return (
			(this._nodes = t = e),
			t.length === 1 && this.useSingleNodeRotation() ? this.rotation(t[0].getAbsoluteRotation()) : this.rotation(0),
			this._nodes.forEach((n) => {
				const r = () => {
					(this.nodes().length === 1 && this.useSingleNodeRotation() && this.rotation(this.nodes()[0].getAbsoluteRotation()),
						this._resetTransformCache(),
						!this._transforming && !this.isDragging() && this.update());
				};
				if (n._attrsAffectingSize.length) {
					const a = n._attrsAffectingSize.map((o) => o + 'Change.' + this._getEventNamespace()).join(' ');
					n.on(a, r);
				}
				(n.on(Es.map((a) => a + `.${this._getEventNamespace()}`).join(' '), r),
					n.on(`absoluteTransformChange.${this._getEventNamespace()}`, r),
					this._proxyDrag(n));
			}),
			this._resetTransformCache(),
			this.findOne('.top-left') && this.update(),
			this
		);
	}
	_proxyDrag(t) {
		let e;
		(t.on(`dragstart.${this._getEventNamespace()}`, (i) => {
			((e = t.getAbsolutePosition()), !this.isDragging() && t !== this.findOne('.back') && this.startDrag(i, !1));
		}),
			t.on(`dragmove.${this._getEventNamespace()}`, (i) => {
				if (!e) return;
				const n = t.getAbsolutePosition(),
					r = n.x - e.x,
					a = n.y - e.y;
				(this.nodes().forEach((o) => {
					if (o === t || o.isDragging()) return;
					const h = o.getAbsolutePosition();
					(o.setAbsolutePosition({ x: h.x + r, y: h.y + a }), o.startDrag(i));
				}),
					(e = null));
			}));
	}
	getNodes() {
		return this._nodes || [];
	}
	getActiveAnchor() {
		return this._movingAnchorName;
	}
	detach() {
		(this._nodes &&
			this._nodes.forEach((t) => {
				t.off('.' + this._getEventNamespace());
			}),
			(this._nodes = []),
			this._resetTransformCache());
	}
	_resetTransformCache() {
		(this._clearCache(ai), this._clearCache('transform'), this._clearSelfAndDescendantCache('absoluteTransform'));
	}
	_getNodeRect() {
		return this._getCache(ai, this.__getNodeRect);
	}
	__getNodeShape(t, e = this.rotation(), i) {
		const n = t.getClientRect({ skipTransform: !0, skipShadow: !0, skipStroke: this.ignoreStroke() }),
			r = t.getAbsoluteScale(i),
			a = t.getAbsolutePosition(i),
			o = n.x * r.x - t.offsetX() * r.x,
			h = n.y * r.y - t.offsetY() * r.y,
			l = (A.getAngle(t.getAbsoluteRotation()) + Math.PI * 2) % (Math.PI * 2),
			c = {
				x: a.x + o * Math.cos(l) + h * Math.sin(-l),
				y: a.y + h * Math.cos(l) + o * Math.sin(l),
				width: n.width * r.x,
				height: n.height * r.y,
				rotation: l
			};
		return Fi(c, -A.getAngle(e), { x: 0, y: 0 });
	}
	__getNodeRect() {
		if (!this.getNode()) return { x: -1e8, y: -1e8, width: 0, height: 0, rotation: 0 };
		const e = [];
		this.nodes().map((l) => {
			const c = l.getClientRect({ skipTransform: !0, skipShadow: !0, skipStroke: this.ignoreStroke() }),
				f = [
					{ x: c.x, y: c.y },
					{ x: c.x + c.width, y: c.y },
					{ x: c.x + c.width, y: c.y + c.height },
					{ x: c.x, y: c.y + c.height }
				],
				d = l.getAbsoluteTransform();
			f.forEach(function (p) {
				const g = d.point(p);
				e.push(g);
			});
		});
		const i = new tt();
		i.rotate(-A.getAngle(this.rotation()));
		let n = 1 / 0,
			r = 1 / 0,
			a = -1 / 0,
			o = -1 / 0;
		(e.forEach(function (l) {
			const c = i.point(l);
			(n === void 0 && ((n = a = c.x), (r = o = c.y)),
				(n = Math.min(n, c.x)),
				(r = Math.min(r, c.y)),
				(a = Math.max(a, c.x)),
				(o = Math.max(o, c.y)));
		}),
			i.invert());
		const h = i.point({ x: n, y: r });
		return { x: h.x, y: h.y, width: a - n, height: o - r, rotation: A.getAngle(this.rotation()) };
	}
	getX() {
		return this._getNodeRect().x;
	}
	getY() {
		return this._getNodeRect().y;
	}
	getWidth() {
		return this._getNodeRect().width;
	}
	getHeight() {
		return this._getNodeRect().height;
	}
	_createElements() {
		(this._createBack(),
			ae.forEach((t) => {
				this._createAnchor(t);
			}),
			this._createAnchor('rotater'));
	}
	_createAnchor(t) {
		const e = new qt({
				stroke: 'rgb(0, 161, 255)',
				fill: 'white',
				strokeWidth: 1,
				name: t + ' _anchor',
				dragDistance: 0,
				draggable: !0,
				hitStrokeWidth: ks ? 10 : 'auto'
			}),
			i = this;
		(e.on('mousedown touchstart', function (n) {
			i._handleMouseDown(n);
		}),
			e.on('dragstart', (n) => {
				(e.stopDrag(), (n.cancelBubble = !0));
			}),
			e.on('dragend', (n) => {
				n.cancelBubble = !0;
			}),
			e.on('mouseenter', () => {
				const n = A.getAngle(this.rotation()),
					r = this.rotateAnchorCursor(),
					a = As(t, n, r);
				(e.getStage().content && (e.getStage().content.style.cursor = a), (this._cursorChange = !0));
			}),
			e.on('mouseout', () => {
				(e.getStage().content && (e.getStage().content.style.cursor = ''), (this._cursorChange = !1));
			}),
			this.add(e));
	}
	_createBack() {
		const t = new x({
			name: 'back',
			width: 0,
			height: 0,
			sceneFunc(e, i) {
				const n = i.getParent(),
					r = n.padding(),
					a = i.width(),
					o = i.height();
				if ((e.beginPath(), e.rect(-r, -r, a + r * 2, o + r * 2), n.rotateEnabled() && n.rotateLineVisible())) {
					const h = n.rotateAnchorAngle(),
						l = n.rotateAnchorOffset(),
						c = m.degToRad(h),
						f = Math.sin(c),
						d = -Math.cos(c),
						p = a / 2,
						g = o / 2;
					let _ = 1 / 0;
					(d < 0 ? (_ = Math.min(_, -g / d)) : d > 0 && (_ = Math.min(_, (o - g) / d)),
						f < 0 ? (_ = Math.min(_, -p / f)) : f > 0 && (_ = Math.min(_, (a - p) / f)));
					const b = p + f * _,
						y = g + d * _,
						S = m._sign(o),
						C = b + f * l * S,
						v = y + d * l * S;
					(e.moveTo(b, y), e.lineTo(C, v));
				}
				e.fillStrokeShape(i);
			},
			hitFunc: (e, i) => {
				if (!this.shouldOverdrawWholeArea()) return;
				const n = this.padding();
				(e.beginPath(), e.rect(-n, -n, i.width() + n * 2, i.height() + n * 2), e.fillStrokeShape(i));
			}
		});
		(this.add(t),
			this._proxyDrag(t),
			t.on('dragstart', (e) => {
				e.cancelBubble = !0;
			}),
			t.on('dragmove', (e) => {
				e.cancelBubble = !0;
			}),
			t.on('dragend', (e) => {
				e.cancelBubble = !0;
			}),
			this.on('dragmove', (e) => {
				this.update();
			}));
	}
	_handleMouseDown(t) {
		if (this._transforming) return;
		this._movingAnchorName = t.target.name().split(' ')[0];
		const e = this._getNodeRect(),
			i = e.width,
			n = e.height,
			r = Math.sqrt(Math.pow(i, 2) + Math.pow(n, 2));
		((this.sin = Math.abs(n / r)),
			(this.cos = Math.abs(i / r)),
			typeof window < 'u' &&
				(window.addEventListener('mousemove', this._handleMouseMove),
				window.addEventListener('touchmove', this._handleMouseMove),
				window.addEventListener('mouseup', this._handleMouseUp, !0),
				window.addEventListener('touchend', this._handleMouseUp, !0)),
			(this._transforming = !0));
		const a = t.target.getAbsolutePosition(),
			o = t.target.getStage().getPointerPosition();
		((this._anchorDragOffset = { x: o.x - a.x, y: o.y - a.y }),
			ke++,
			this._fire('transformstart', { evt: t.evt, target: this.getNode() }),
			this._nodes.forEach((h) => {
				h._fire('transformstart', { evt: t.evt, target: h });
			}));
	}
	_handleMouseMove(t) {
		let e, i, n;
		const r = this.findOne('.' + this._movingAnchorName),
			a = r.getStage();
		a.setPointersPositions(t);
		const o = a.getPointerPosition();
		let h = { x: o.x - this._anchorDragOffset.x, y: o.y - this._anchorDragOffset.y };
		const l = r.getAbsolutePosition();
		(this.anchorDragBoundFunc() && (h = this.anchorDragBoundFunc()(l, h, t)), r.setAbsolutePosition(h));
		const c = r.getAbsolutePosition();
		if (l.x === c.x && l.y === c.y) return;
		if (this._movingAnchorName === 'rotater') {
			const S = this._getNodeRect();
			((e = r.x() - S.width / 2), (i = -r.y() + S.height / 2));
			const C = A.getAngle(this.rotateAnchorAngle());
			let v = Math.atan2(-i, e) + Math.PI / 2 - C;
			S.height < 0 && (v -= Math.PI);
			const k = A.getAngle(this.rotation()) + v,
				O = A.getAngle(this.rotationSnapTolerance()),
				L = Gs(this.rotationSnaps(), k, O) - S.rotation,
				N = Ms(S, L);
			this._fitNodesInto(N, t);
			return;
		}
		const f = this.shiftBehavior();
		let d;
		f === 'inverted' ? (d = this.keepRatio() && !t.shiftKey) : f === 'none' ? (d = this.keepRatio()) : (d = this.keepRatio() || t.shiftKey);
		let p = this.centeredScaling() || t.altKey;
		if (this._movingAnchorName === 'top-left') {
			if (d) {
				const S = p ? { x: this.width() / 2, y: this.height() / 2 } : { x: this.findOne('.bottom-right').x(), y: this.findOne('.bottom-right').y() };
				n = Math.sqrt(Math.pow(S.x - r.x(), 2) + Math.pow(S.y - r.y(), 2));
				const C = this.findOne('.top-left').x() > S.x ? -1 : 1,
					v = this.findOne('.top-left').y() > S.y ? -1 : 1;
				((e = n * this.cos * C), (i = n * this.sin * v), this.findOne('.top-left').x(S.x - e), this.findOne('.top-left').y(S.y - i));
			}
		} else if (this._movingAnchorName === 'top-center') this.findOne('.top-left').y(r.y());
		else if (this._movingAnchorName === 'top-right') {
			if (d) {
				const S = p ? { x: this.width() / 2, y: this.height() / 2 } : { x: this.findOne('.bottom-left').x(), y: this.findOne('.bottom-left').y() };
				n = Math.sqrt(Math.pow(r.x() - S.x, 2) + Math.pow(S.y - r.y(), 2));
				const C = this.findOne('.top-right').x() < S.x ? -1 : 1,
					v = this.findOne('.top-right').y() > S.y ? -1 : 1;
				((e = n * this.cos * C), (i = n * this.sin * v), this.findOne('.top-right').x(S.x + e), this.findOne('.top-right').y(S.y - i));
			}
			var g = r.position();
			(this.findOne('.top-left').y(g.y), this.findOne('.bottom-right').x(g.x));
		} else if (this._movingAnchorName === 'middle-left') this.findOne('.top-left').x(r.x());
		else if (this._movingAnchorName === 'middle-right') this.findOne('.bottom-right').x(r.x());
		else if (this._movingAnchorName === 'bottom-left') {
			if (d) {
				const S = p ? { x: this.width() / 2, y: this.height() / 2 } : { x: this.findOne('.top-right').x(), y: this.findOne('.top-right').y() };
				n = Math.sqrt(Math.pow(S.x - r.x(), 2) + Math.pow(r.y() - S.y, 2));
				const C = S.x < r.x() ? -1 : 1,
					v = r.y() < S.y ? -1 : 1;
				((e = n * this.cos * C), (i = n * this.sin * v), r.x(S.x - e), r.y(S.y + i));
			}
			((g = r.position()), this.findOne('.top-left').x(g.x), this.findOne('.bottom-right').y(g.y));
		} else if (this._movingAnchorName === 'bottom-center') this.findOne('.bottom-right').y(r.y());
		else if (this._movingAnchorName === 'bottom-right') {
			if (d) {
				const S = p ? { x: this.width() / 2, y: this.height() / 2 } : { x: this.findOne('.top-left').x(), y: this.findOne('.top-left').y() };
				n = Math.sqrt(Math.pow(r.x() - S.x, 2) + Math.pow(r.y() - S.y, 2));
				const C = this.findOne('.bottom-right').x() < S.x ? -1 : 1,
					v = this.findOne('.bottom-right').y() < S.y ? -1 : 1;
				((e = n * this.cos * C), (i = n * this.sin * v), this.findOne('.bottom-right').x(S.x + e), this.findOne('.bottom-right').y(S.y + i));
			}
		} else console.error(new Error('Wrong position argument of selection resizer: ' + this._movingAnchorName));
		if (((p = this.centeredScaling() || t.altKey), p)) {
			const S = this.findOne('.top-left'),
				C = this.findOne('.bottom-right'),
				v = S.x(),
				G = S.y(),
				k = this.getWidth() - C.x(),
				O = this.getHeight() - C.y();
			(C.move({ x: -v, y: -G }), S.move({ x: k, y: O }));
		}
		const _ = this.findOne('.top-left').getAbsolutePosition();
		((e = _.x), (i = _.y));
		const b = this.findOne('.bottom-right').x() - this.findOne('.top-left').x(),
			y = this.findOne('.bottom-right').y() - this.findOne('.top-left').y();
		this._fitNodesInto({ x: e, y: i, width: b, height: y, rotation: A.getAngle(this.rotation()) }, t);
	}
	_handleMouseUp(t) {
		this._removeEvents(t);
	}
	getAbsoluteTransform() {
		return this.getTransform();
	}
	_removeEvents(t) {
		var e;
		if (this._transforming) {
			((this._transforming = !1),
				typeof window < 'u' &&
					(window.removeEventListener('mousemove', this._handleMouseMove),
					window.removeEventListener('touchmove', this._handleMouseMove),
					window.removeEventListener('mouseup', this._handleMouseUp, !0),
					window.removeEventListener('touchend', this._handleMouseUp, !0)));
			const i = this.getNode();
			(ke--,
				this._fire('transformend', { evt: t, target: i }),
				(e = this.getLayer()) === null || e === void 0 || e.batchDraw(),
				i &&
					this._nodes.forEach((n) => {
						var r;
						(n._fire('transformend', { evt: t, target: n }), (r = n.getLayer()) === null || r === void 0 || r.batchDraw());
					}),
				(this._movingAnchorName = null));
		}
	}
	_fitNodesInto(t, e) {
		const i = this._getNodeRect(),
			n = 1;
		if (m._inRange(t.width, -this.padding() * 2 - n, n)) {
			this.update();
			return;
		}
		if (m._inRange(t.height, -this.padding() * 2 - n, n)) {
			this.update();
			return;
		}
		const r = new tt();
		if ((r.rotate(A.getAngle(this.rotation())), this._movingAnchorName && t.width < 0 && this._movingAnchorName.indexOf('left') >= 0)) {
			const d = r.point({ x: -this.padding() * 2, y: 0 });
			((t.x += d.x),
				(t.y += d.y),
				(t.width += this.padding() * 2),
				(this._movingAnchorName = this._movingAnchorName.replace('left', 'right')),
				(this._anchorDragOffset.x -= d.x),
				(this._anchorDragOffset.y -= d.y));
		} else if (this._movingAnchorName && t.width < 0 && this._movingAnchorName.indexOf('right') >= 0) {
			const d = r.point({ x: this.padding() * 2, y: 0 });
			((this._movingAnchorName = this._movingAnchorName.replace('right', 'left')),
				(this._anchorDragOffset.x -= d.x),
				(this._anchorDragOffset.y -= d.y),
				(t.width += this.padding() * 2));
		}
		if (this._movingAnchorName && t.height < 0 && this._movingAnchorName.indexOf('top') >= 0) {
			const d = r.point({ x: 0, y: -this.padding() * 2 });
			((t.x += d.x),
				(t.y += d.y),
				(this._movingAnchorName = this._movingAnchorName.replace('top', 'bottom')),
				(this._anchorDragOffset.x -= d.x),
				(this._anchorDragOffset.y -= d.y),
				(t.height += this.padding() * 2));
		} else if (this._movingAnchorName && t.height < 0 && this._movingAnchorName.indexOf('bottom') >= 0) {
			const d = r.point({ x: 0, y: this.padding() * 2 });
			((this._movingAnchorName = this._movingAnchorName.replace('bottom', 'top')),
				(this._anchorDragOffset.x -= d.x),
				(this._anchorDragOffset.y -= d.y),
				(t.height += this.padding() * 2));
		}
		if (this.boundBoxFunc()) {
			const d = this.boundBoxFunc()(i, t);
			d ? (t = d) : m.warn('boundBoxFunc returned falsy. You should return new bound rect from it!');
		}
		const a = 1e7,
			o = new tt();
		(o.translate(i.x, i.y), o.rotate(i.rotation), o.scale(i.width / a, i.height / a));
		const h = new tt(),
			l = t.width / a,
			c = t.height / a;
		this.flipEnabled() === !1
			? (h.translate(t.x, t.y),
				h.rotate(t.rotation),
				h.translate(t.width < 0 ? t.width : 0, t.height < 0 ? t.height : 0),
				h.scale(Math.abs(l), Math.abs(c)))
			: (h.translate(t.x, t.y), h.rotate(t.rotation), h.scale(l, c));
		const f = h.multiply(o.invert());
		(this._nodes.forEach((d) => {
			var p;
			if (!d.getStage()) return;
			const g = d.getParent().getAbsoluteTransform(),
				_ = d.getTransform().copy();
			_.translate(d.offsetX(), d.offsetY());
			const b = new tt();
			b.multiply(g.copy().invert()).multiply(f).multiply(g).multiply(_);
			const y = b.decompose();
			(d.setAttrs(y), (p = d.getLayer()) === null || p === void 0 || p.batchDraw());
		}),
			this.rotation(m._getRotation(t.rotation)),
			this._nodes.forEach((d) => {
				(this._fire('transform', { evt: e, target: d }), d._fire('transform', { evt: e, target: d }));
			}),
			this._resetTransformCache(),
			this.update(),
			this.getLayer().batchDraw());
	}
	forceUpdate() {
		(this._resetTransformCache(), this.update());
	}
	_batchChangeChild(t, e) {
		this.findOne(t).setAttrs(e);
	}
	update() {
		var t;
		const e = this._getNodeRect();
		this.rotation(m._getRotation(e.rotation));
		const i = e.width,
			n = e.height,
			r = this.enabledAnchors(),
			a = this.resizeEnabled(),
			o = this.padding(),
			h = this.anchorSize(),
			l = this.find('._anchor');
		(l.forEach((k) => {
			k.setAttrs({
				width: h,
				height: h,
				offsetX: h / 2,
				offsetY: h / 2,
				stroke: this.anchorStroke(),
				strokeWidth: this.anchorStrokeWidth(),
				fill: this.anchorFill(),
				cornerRadius: this.anchorCornerRadius()
			});
		}),
			this._batchChangeChild('.top-left', { x: 0, y: 0, offsetX: h / 2 + o, offsetY: h / 2 + o, visible: a && r.indexOf('top-left') >= 0 }),
			this._batchChangeChild('.top-center', { x: i / 2, y: 0, offsetY: h / 2 + o, visible: a && r.indexOf('top-center') >= 0 }),
			this._batchChangeChild('.top-right', { x: i, y: 0, offsetX: h / 2 - o, offsetY: h / 2 + o, visible: a && r.indexOf('top-right') >= 0 }),
			this._batchChangeChild('.middle-left', { x: 0, y: n / 2, offsetX: h / 2 + o, visible: a && r.indexOf('middle-left') >= 0 }),
			this._batchChangeChild('.middle-right', { x: i, y: n / 2, offsetX: h / 2 - o, visible: a && r.indexOf('middle-right') >= 0 }),
			this._batchChangeChild('.bottom-left', { x: 0, y: n, offsetX: h / 2 + o, offsetY: h / 2 - o, visible: a && r.indexOf('bottom-left') >= 0 }),
			this._batchChangeChild('.bottom-center', { x: i / 2, y: n, offsetY: h / 2 - o, visible: a && r.indexOf('bottom-center') >= 0 }),
			this._batchChangeChild('.bottom-right', { x: i, y: n, offsetX: h / 2 - o, offsetY: h / 2 - o, visible: a && r.indexOf('bottom-right') >= 0 }));
		const c = this.rotateAnchorAngle(),
			f = this.rotateAnchorOffset(),
			d = m.degToRad(c),
			p = Math.sin(d),
			g = -Math.cos(d),
			_ = i / 2,
			b = n / 2;
		let y = 1 / 0;
		(g < 0 ? (y = Math.min(y, -b / g)) : g > 0 && (y = Math.min(y, (n - b) / g)),
			p < 0 ? (y = Math.min(y, -_ / p)) : p > 0 && (y = Math.min(y, (i - _) / p)));
		const S = _ + p * y,
			C = b + g * y,
			v = m._sign(n);
		(this._batchChangeChild('.rotater', { x: S + p * f * v, y: C + g * f * v - o * g, visible: this.rotateEnabled() }),
			this._batchChangeChild('.back', {
				width: i,
				height: n,
				visible: this.borderEnabled(),
				stroke: this.borderStroke(),
				strokeWidth: this.borderStrokeWidth(),
				dash: this.borderDash(),
				draggable: this.nodes().some((k) => k.draggable()),
				x: 0,
				y: 0
			}));
		const G = this.anchorStyleFunc();
		(G &&
			l.forEach((k) => {
				G(k);
			}),
			(t = this.getLayer()) === null || t === void 0 || t.batchDraw());
	}
	isTransforming() {
		return this._transforming;
	}
	stopTransform() {
		if (this._transforming) {
			this._removeEvents();
			const t = this.findOne('.' + this._movingAnchorName);
			t && t.stopDrag();
		}
	}
	destroy() {
		return (
			this.getStage() && this._cursorChange && this.getStage().content && (this.getStage().content.style.cursor = ''),
			kt.prototype.destroy.call(this),
			this.detach(),
			this._removeEvents(),
			this
		);
	}
	toObject() {
		return E.prototype.toObject.call(this);
	}
	clone(t) {
		return E.prototype.clone.call(this, t);
	}
	getClientRect() {
		return this.nodes().length > 0 ? super.getClientRect() : { x: 0, y: 0, width: 0, height: 0 };
	}
}
F.isTransforming = () => ke > 0;
function Os(s) {
	return (
		s instanceof Array || m.warn('enabledAnchors value should be an array'),
		s instanceof Array &&
			s.forEach(function (t) {
				ae.indexOf(t) === -1 && m.warn('Unknown anchor name: ' + t + '. Available names are: ' + ae.join(', '));
			}),
		s || []
	);
}
F.prototype.className = 'Transformer';
K(F);
u.addGetterSetter(F, 'enabledAnchors', ae, Os);
u.addGetterSetter(F, 'flipEnabled', !0, st());
u.addGetterSetter(F, 'resizeEnabled', !0);
u.addGetterSetter(F, 'anchorSize', 10, P());
u.addGetterSetter(F, 'rotateEnabled', !0);
u.addGetterSetter(F, 'rotateLineVisible', !0);
u.addGetterSetter(F, 'rotationSnaps', []);
u.addGetterSetter(F, 'rotateAnchorOffset', 50, P());
u.addGetterSetter(F, 'rotateAnchorAngle', 0, P());
u.addGetterSetter(F, 'rotateAnchorCursor', 'crosshair');
u.addGetterSetter(F, 'rotationSnapTolerance', 5, P());
u.addGetterSetter(F, 'borderEnabled', !0);
u.addGetterSetter(F, 'anchorStroke', 'rgb(0, 161, 255)');
u.addGetterSetter(F, 'anchorStrokeWidth', 1, P());
u.addGetterSetter(F, 'anchorFill', 'white');
u.addGetterSetter(F, 'anchorCornerRadius', 0, P());
u.addGetterSetter(F, 'borderStroke', 'rgb(0, 161, 255)');
u.addGetterSetter(F, 'borderStrokeWidth', 1, P());
u.addGetterSetter(F, 'borderDash');
u.addGetterSetter(F, 'keepRatio', !0);
u.addGetterSetter(F, 'shiftBehavior', 'default');
u.addGetterSetter(F, 'centeredScaling', !1);
u.addGetterSetter(F, 'ignoreStroke', !1);
u.addGetterSetter(F, 'padding', 0, P());
u.addGetterSetter(F, 'nodes');
u.addGetterSetter(F, 'node');
u.addGetterSetter(F, 'boundBoxFunc');
u.addGetterSetter(F, 'anchorDragBoundFunc');
u.addGetterSetter(F, 'anchorStyleFunc');
u.addGetterSetter(F, 'shouldOverdrawWholeArea', !1);
u.addGetterSetter(F, 'useSingleNodeRotation', !0);
u.backCompat(F, { lineEnabled: 'borderEnabled', rotateHandlerOffset: 'rotateAnchorOffset', enabledHandlers: 'enabledAnchors' });
class lt extends x {
	_sceneFunc(t) {
		(t.beginPath(),
			t.arc(0, 0, this.radius(), 0, A.getAngle(this.angle()), this.clockwise()),
			t.lineTo(0, 0),
			t.closePath(),
			t.fillStrokeShape(this));
	}
	getWidth() {
		return this.radius() * 2;
	}
	getHeight() {
		return this.radius() * 2;
	}
	setWidth(t) {
		this.radius(t / 2);
	}
	setHeight(t) {
		this.radius(t / 2);
	}
}
lt.prototype.className = 'Wedge';
lt.prototype._centroid = !0;
lt.prototype._attrsAffectingSize = ['radius'];
K(lt);
u.addGetterSetter(lt, 'radius', 0, P());
u.addGetterSetter(lt, 'angle', 0, P());
u.addGetterSetter(lt, 'clockwise', !1);
u.backCompat(lt, { angleDeg: 'angle', getAngleDeg: 'getAngle', setAngleDeg: 'setAngle' });
function oi() {
	((this.r = 0), (this.g = 0), (this.b = 0), (this.a = 0), (this.next = null));
}
const Ls = [
		512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292, 512, 454, 405, 364, 328, 298, 271, 496, 456, 420, 388, 360, 335, 312,
		292, 273, 512, 482, 454, 428, 405, 383, 364, 345, 328, 312, 298, 284, 271, 259, 496, 475, 456, 437, 420, 404, 388, 374, 360, 347, 335, 323, 312,
		302, 292, 282, 273, 265, 512, 497, 482, 468, 454, 441, 428, 417, 405, 394, 383, 373, 364, 354, 345, 337, 328, 320, 312, 305, 298, 291, 284, 278,
		271, 265, 259, 507, 496, 485, 475, 465, 456, 446, 437, 428, 420, 412, 404, 396, 388, 381, 374, 367, 360, 354, 347, 341, 335, 329, 323, 318, 312,
		307, 302, 297, 292, 287, 282, 278, 273, 269, 265, 261, 512, 505, 497, 489, 482, 475, 468, 461, 454, 447, 441, 435, 428, 422, 417, 411, 405, 399,
		394, 389, 383, 378, 373, 368, 364, 359, 354, 350, 345, 341, 337, 332, 328, 324, 320, 316, 312, 309, 305, 301, 298, 294, 291, 287, 284, 281, 278,
		274, 271, 268, 265, 262, 259, 257, 507, 501, 496, 491, 485, 480, 475, 470, 465, 460, 456, 451, 446, 442, 437, 433, 428, 424, 420, 416, 412, 408,
		404, 400, 396, 392, 388, 385, 381, 377, 374, 370, 367, 363, 360, 357, 354, 350, 347, 344, 341, 338, 335, 332, 329, 326, 323, 320, 318, 315, 312,
		310, 307, 304, 302, 299, 297, 294, 292, 289, 287, 285, 282, 280, 278, 275, 273, 271, 269, 267, 265, 263, 261, 259
	],
	Is = [
		9, 11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17, 17, 17, 17, 17, 17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 18, 19, 19, 19, 19, 19, 19,
		19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
		21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
		22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
		23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
		24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
		24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
		24, 24
	];
function Ds(s, t) {
	const e = s.data,
		i = s.width,
		n = s.height;
	let r, a, o, h, l, c, f, d, p, g, _, b, y, S, C, v, G, k, O, M;
	const L = t + t + 1,
		N = i - 1,
		B = n - 1,
		I = t + 1,
		H = (I * (I + 1)) / 2,
		R = new oi(),
		w = Ls[t],
		T = Is[t];
	let W = null,
		D = R,
		X = null,
		Q = null;
	for (let Y = 1; Y < L; Y++) ((D = D.next = new oi()), Y === I && (W = D));
	((D.next = R), (o = a = 0));
	for (let Y = 0; Y < n; Y++) {
		((b = y = S = C = h = l = c = f = 0),
			(d = I * (v = e[a])),
			(p = I * (G = e[a + 1])),
			(g = I * (k = e[a + 2])),
			(_ = I * (O = e[a + 3])),
			(h += H * v),
			(l += H * G),
			(c += H * k),
			(f += H * O),
			(D = R));
		for (let $ = 0; $ < I; $++) ((D.r = v), (D.g = G), (D.b = k), (D.a = O), (D = D.next));
		for (let $ = 1; $ < I; $++)
			((r = a + ((N < $ ? N : $) << 2)),
				(h += (D.r = v = e[r]) * (M = I - $)),
				(l += (D.g = G = e[r + 1]) * M),
				(c += (D.b = k = e[r + 2]) * M),
				(f += (D.a = O = e[r + 3]) * M),
				(b += v),
				(y += G),
				(S += k),
				(C += O),
				(D = D.next));
		((X = R), (Q = W));
		for (let $ = 0; $ < i; $++)
			((e[a + 3] = O = (f * w) >> T),
				O !== 0
					? ((O = 255 / O), (e[a] = ((h * w) >> T) * O), (e[a + 1] = ((l * w) >> T) * O), (e[a + 2] = ((c * w) >> T) * O))
					: (e[a] = e[a + 1] = e[a + 2] = 0),
				(h -= d),
				(l -= p),
				(c -= g),
				(f -= _),
				(d -= X.r),
				(p -= X.g),
				(g -= X.b),
				(_ -= X.a),
				(r = (o + ((r = $ + t + 1) < N ? r : N)) << 2),
				(b += X.r = e[r]),
				(y += X.g = e[r + 1]),
				(S += X.b = e[r + 2]),
				(C += X.a = e[r + 3]),
				(h += b),
				(l += y),
				(c += S),
				(f += C),
				(X = X.next),
				(d += v = Q.r),
				(p += G = Q.g),
				(g += k = Q.b),
				(_ += O = Q.a),
				(b -= v),
				(y -= G),
				(S -= k),
				(C -= O),
				(Q = Q.next),
				(a += 4));
		o += i;
	}
	for (let Y = 0; Y < i; Y++) {
		((y = S = C = b = l = c = f = h = 0),
			(a = Y << 2),
			(d = I * (v = e[a])),
			(p = I * (G = e[a + 1])),
			(g = I * (k = e[a + 2])),
			(_ = I * (O = e[a + 3])),
			(h += H * v),
			(l += H * G),
			(c += H * k),
			(f += H * O),
			(D = R));
		for (let Z = 0; Z < I; Z++) ((D.r = v), (D.g = G), (D.b = k), (D.a = O), (D = D.next));
		let $ = i;
		for (let Z = 1; Z <= t; Z++)
			((a = ($ + Y) << 2),
				(h += (D.r = v = e[a]) * (M = I - Z)),
				(l += (D.g = G = e[a + 1]) * M),
				(c += (D.b = k = e[a + 2]) * M),
				(f += (D.a = O = e[a + 3]) * M),
				(b += v),
				(y += G),
				(S += k),
				(C += O),
				(D = D.next),
				Z < B && ($ += i));
		((a = Y), (X = R), (Q = W));
		for (let Z = 0; Z < n; Z++)
			((r = a << 2),
				(e[r + 3] = O = (f * w) >> T),
				O > 0
					? ((O = 255 / O), (e[r] = ((h * w) >> T) * O), (e[r + 1] = ((l * w) >> T) * O), (e[r + 2] = ((c * w) >> T) * O))
					: (e[r] = e[r + 1] = e[r + 2] = 0),
				(h -= d),
				(l -= p),
				(c -= g),
				(f -= _),
				(d -= X.r),
				(p -= X.g),
				(g -= X.b),
				(_ -= X.a),
				(r = (Y + ((r = Z + I) < B ? r : B) * i) << 2),
				(h += b += X.r = e[r]),
				(l += y += X.g = e[r + 1]),
				(c += S += X.b = e[r + 2]),
				(f += C += X.a = e[r + 3]),
				(X = X.next),
				(d += v = Q.r),
				(p += G = Q.g),
				(g += k = Q.b),
				(_ += O = Q.a),
				(b -= v),
				(y -= G),
				(S -= k),
				(C -= O),
				(Q = Q.next),
				(a += i));
	}
}
const Ns = function (t) {
	const e = Math.round(this.blurRadius());
	e > 0 && Ds(t, e);
};
u.addGetterSetter(E, 'blurRadius', 0, P(), u.afterSetFilter);
const Fs = function (s) {
	const t = this.brightness() * 255,
		e = s.data,
		i = e.length;
	for (let n = 0; n < i; n += 4) ((e[n] += t), (e[n + 1] += t), (e[n + 2] += t));
};
u.addGetterSetter(E, 'brightness', 0, P(), u.afterSetFilter);
const Bs = function (s) {
		const t = this.brightness(),
			e = s.data,
			i = e.length;
		for (let n = 0; n < i; n += 4)
			((e[n] = Math.min(255, e[n] * t)), (e[n + 1] = Math.min(255, e[n + 1] * t)), (e[n + 2] = Math.min(255, e[n + 2] * t)));
	},
	Hs = function (s) {
		const t = Math.pow((this.contrast() + 100) / 100, 2),
			e = s.data,
			i = e.length;
		let n = 150,
			r = 150,
			a = 150;
		for (let o = 0; o < i; o += 4)
			((n = e[o]),
				(r = e[o + 1]),
				(a = e[o + 2]),
				(n /= 255),
				(n -= 0.5),
				(n *= t),
				(n += 0.5),
				(n *= 255),
				(r /= 255),
				(r -= 0.5),
				(r *= t),
				(r += 0.5),
				(r *= 255),
				(a /= 255),
				(a -= 0.5),
				(a *= t),
				(a += 0.5),
				(a *= 255),
				(n = n < 0 ? 0 : n > 255 ? 255 : n),
				(r = r < 0 ? 0 : r > 255 ? 255 : r),
				(a = a < 0 ? 0 : a > 255 ? 255 : a),
				(e[o] = n),
				(e[o + 1] = r),
				(e[o + 2] = a));
	};
u.addGetterSetter(E, 'contrast', 0, P(), u.afterSetFilter);
const Ws = function (s) {
	var t, e, i, n, r, a, o, h, l;
	const c = s.data,
		f = s.width,
		d = s.height,
		p = Math.min(1, Math.max(0, (e = (t = this.embossStrength) === null || t === void 0 ? void 0 : t.call(this)) !== null && e !== void 0 ? e : 0.5)),
		g = Math.min(
			1,
			Math.max(0, (n = (i = this.embossWhiteLevel) === null || i === void 0 ? void 0 : i.call(this)) !== null && n !== void 0 ? n : 0.5)
		),
		b =
			(o = { 'top-left': 315, top: 270, 'top-right': 225, right: 180, 'bottom-right': 135, bottom: 90, 'bottom-left': 45, left: 0 }[
				(a = (r = this.embossDirection) === null || r === void 0 ? void 0 : r.call(this)) !== null && a !== void 0 ? a : 'top-left'
			]) !== null && o !== void 0
				? o
				: 315,
		y = !!((l = (h = this.embossBlend) === null || h === void 0 ? void 0 : h.call(this)) !== null && l !== void 0 && l),
		S = p * 10,
		C = g * 255,
		v = (b * Math.PI) / 180,
		G = Math.cos(v),
		k = Math.sin(v),
		O = (128 / 1020) * S,
		M = new Uint8ClampedArray(c),
		L = new Float32Array(f * d);
	for (let R = 0, w = 0; w < c.length; w += 4, R++) L[R] = 0.2126 * M[w] + 0.7152 * M[w + 1] + 0.0722 * M[w + 2];
	const N = [-1, 0, 1, -2, 0, 2, -1, 0, 1],
		B = [-1, -2, -1, 0, 0, 0, 1, 2, 1],
		I = [-f - 1, -f, -f + 1, -1, 0, 1, f - 1, f, f + 1],
		H = (R) => (R < 0 ? 0 : R > 255 ? 255 : R);
	for (let R = 1; R < d - 1; R++)
		for (let w = 1; w < f - 1; w++) {
			const T = R * f + w;
			let W = 0,
				D = 0;
			((W += L[T + I[0]] * N[0]),
				(D += L[T + I[0]] * B[0]),
				(W += L[T + I[1]] * N[1]),
				(D += L[T + I[1]] * B[1]),
				(W += L[T + I[2]] * N[2]),
				(D += L[T + I[2]] * B[2]),
				(W += L[T + I[3]] * N[3]),
				(D += L[T + I[3]] * B[3]),
				(W += L[T + I[5]] * N[5]),
				(D += L[T + I[5]] * B[5]),
				(W += L[T + I[6]] * N[6]),
				(D += L[T + I[6]] * B[6]),
				(W += L[T + I[7]] * N[7]),
				(D += L[T + I[7]] * B[7]),
				(W += L[T + I[8]] * N[8]),
				(D += L[T + I[8]] * B[8]));
			const X = G * W + k * D,
				Q = H(C + X * O),
				Y = T * 4;
			if (y) {
				const $ = Q - C;
				((c[Y] = H(M[Y] + $)), (c[Y + 1] = H(M[Y + 1] + $)), (c[Y + 2] = H(M[Y + 2] + $)), (c[Y + 3] = M[Y + 3]));
			} else ((c[Y] = c[Y + 1] = c[Y + 2] = Q), (c[Y + 3] = M[Y + 3]));
		}
	for (let R = 0; R < f; R++) {
		let w = R * 4,
			T = ((d - 1) * f + R) * 4;
		((c[w] = M[w]),
			(c[w + 1] = M[w + 1]),
			(c[w + 2] = M[w + 2]),
			(c[w + 3] = M[w + 3]),
			(c[T] = M[T]),
			(c[T + 1] = M[T + 1]),
			(c[T + 2] = M[T + 2]),
			(c[T + 3] = M[T + 3]));
	}
	for (let R = 1; R < d - 1; R++) {
		let w = R * f * 4,
			T = (R * f + (f - 1)) * 4;
		((c[w] = M[w]),
			(c[w + 1] = M[w + 1]),
			(c[w + 2] = M[w + 2]),
			(c[w + 3] = M[w + 3]),
			(c[T] = M[T]),
			(c[T + 1] = M[T + 1]),
			(c[T + 2] = M[T + 2]),
			(c[T + 3] = M[T + 3]));
	}
	return s;
};
u.addGetterSetter(E, 'embossStrength', 0.5, P(), u.afterSetFilter);
u.addGetterSetter(E, 'embossWhiteLevel', 0.5, P(), u.afterSetFilter);
u.addGetterSetter(E, 'embossDirection', 'top-left', void 0, u.afterSetFilter);
u.addGetterSetter(E, 'embossBlend', !1, void 0, u.afterSetFilter);
function _e(s, t, e, i, n) {
	const r = e - t,
		a = n - i;
	if (r === 0) return i + a / 2;
	if (a === 0) return i;
	let o = (s - t) / r;
	return ((o = a * o + i), o);
}
const zs = function (s) {
	const t = s.data,
		e = t.length;
	let i = t[0],
		n = i,
		r,
		a = t[1],
		o = a,
		h,
		l = t[2],
		c = l,
		f;
	const d = this.enhance();
	if (d === 0) return;
	for (let C = 0; C < e; C += 4)
		((r = t[C + 0]),
			r < i ? (i = r) : r > n && (n = r),
			(h = t[C + 1]),
			h < a ? (a = h) : h > o && (o = h),
			(f = t[C + 2]),
			f < l ? (l = f) : f > c && (c = f));
	(n === i && ((n = 255), (i = 0)), o === a && ((o = 255), (a = 0)), c === l && ((c = 255), (l = 0)));
	let p, g, _, b, y, S;
	if (d > 0)
		((p = n + d * (255 - n)), (g = i - d * (i - 0)), (_ = o + d * (255 - o)), (b = a - d * (a - 0)), (y = c + d * (255 - c)), (S = l - d * (l - 0)));
	else {
		const C = (n + i) * 0.5;
		((p = n + d * (n - C)), (g = i + d * (i - C)));
		const v = (o + a) * 0.5;
		((_ = o + d * (o - v)), (b = a + d * (a - v)));
		const G = (c + l) * 0.5;
		((y = c + d * (c - G)), (S = l + d * (l - G)));
	}
	for (let C = 0; C < e; C += 4)
		((t[C + 0] = _e(t[C + 0], i, n, g, p)), (t[C + 1] = _e(t[C + 1], a, o, b, _)), (t[C + 2] = _e(t[C + 2], l, c, S, y)));
};
u.addGetterSetter(E, 'enhance', 0, P(), u.afterSetFilter);
const Ys = function (s) {
	const t = s.data,
		e = t.length;
	for (let i = 0; i < e; i += 4) {
		const n = 0.34 * t[i] + 0.5 * t[i + 1] + 0.16 * t[i + 2];
		((t[i] = n), (t[i + 1] = n), (t[i + 2] = n));
	}
};
u.addGetterSetter(E, 'hue', 0, P(), u.afterSetFilter);
u.addGetterSetter(E, 'saturation', 0, P(), u.afterSetFilter);
u.addGetterSetter(E, 'luminance', 0, P(), u.afterSetFilter);
const Xs = function (s) {
		const t = s.data,
			e = t.length,
			i = 1,
			n = Math.pow(2, this.saturation()),
			r = Math.abs(this.hue() + 360) % 360,
			a = this.luminance() * 127,
			o = i * n * Math.cos((r * Math.PI) / 180),
			h = i * n * Math.sin((r * Math.PI) / 180),
			l = 0.299 * i + 0.701 * o + 0.167 * h,
			c = 0.587 * i - 0.587 * o + 0.33 * h,
			f = 0.114 * i - 0.114 * o - 0.497 * h,
			d = 0.299 * i - 0.299 * o - 0.328 * h,
			p = 0.587 * i + 0.413 * o + 0.035 * h,
			g = 0.114 * i - 0.114 * o + 0.293 * h,
			_ = 0.299 * i - 0.3 * o + 1.25 * h,
			b = 0.587 * i - 0.586 * o - 1.05 * h,
			y = 0.114 * i + 0.886 * o - 0.2 * h;
		let S, C, v, G;
		for (let k = 0; k < e; k += 4)
			((S = t[k + 0]),
				(C = t[k + 1]),
				(v = t[k + 2]),
				(G = t[k + 3]),
				(t[k + 0] = l * S + c * C + f * v + a),
				(t[k + 1] = d * S + p * C + g * v + a),
				(t[k + 2] = _ * S + b * C + y * v + a),
				(t[k + 3] = G));
	},
	Us = function (s) {
		const t = s.data,
			e = t.length,
			i = Math.pow(2, this.value()),
			n = Math.pow(2, this.saturation()),
			r = Math.abs(this.hue() + 360) % 360,
			a = i * n * Math.cos((r * Math.PI) / 180),
			o = i * n * Math.sin((r * Math.PI) / 180),
			h = 0.299 * i + 0.701 * a + 0.167 * o,
			l = 0.587 * i - 0.587 * a + 0.33 * o,
			c = 0.114 * i - 0.114 * a - 0.497 * o,
			f = 0.299 * i - 0.299 * a - 0.328 * o,
			d = 0.587 * i + 0.413 * a + 0.035 * o,
			p = 0.114 * i - 0.114 * a + 0.293 * o,
			g = 0.299 * i - 0.3 * a + 1.25 * o,
			_ = 0.587 * i - 0.586 * a - 1.05 * o,
			b = 0.114 * i + 0.886 * a - 0.2 * o;
		for (let y = 0; y < e; y += 4) {
			const S = t[y + 0],
				C = t[y + 1],
				v = t[y + 2],
				G = t[y + 3];
			((t[y + 0] = h * S + l * C + c * v), (t[y + 1] = f * S + d * C + p * v), (t[y + 2] = g * S + _ * C + b * v), (t[y + 3] = G));
		}
	};
u.addGetterSetter(E, 'hue', 0, P(), u.afterSetFilter);
u.addGetterSetter(E, 'saturation', 0, P(), u.afterSetFilter);
u.addGetterSetter(E, 'value', 0, P(), u.afterSetFilter);
const Vs = function (s) {
		const t = s.data,
			e = t.length;
		for (let i = 0; i < e; i += 4) ((t[i] = 255 - t[i]), (t[i + 1] = 255 - t[i + 1]), (t[i + 2] = 255 - t[i + 2]));
	},
	qs = function (s, t, e) {
		const i = s.data,
			n = t.data,
			r = s.width,
			a = s.height,
			o = e.polarCenterX || r / 2,
			h = e.polarCenterY || a / 2;
		let l = Math.sqrt(o * o + h * h),
			c = r - o,
			f = a - h;
		const d = Math.sqrt(c * c + f * f);
		l = d > l ? d : l;
		const p = a,
			g = r,
			_ = ((360 / g) * Math.PI) / 180;
		for (let b = 0; b < g; b += 1) {
			const y = Math.sin(b * _),
				S = Math.cos(b * _);
			for (let C = 0; C < p; C += 1) {
				((c = Math.floor(o + ((l * C) / p) * S)), (f = Math.floor(h + ((l * C) / p) * y)));
				let v = (f * r + c) * 4;
				const G = i[v + 0],
					k = i[v + 1],
					O = i[v + 2],
					M = i[v + 3];
				((v = (b + C * r) * 4), (n[v + 0] = G), (n[v + 1] = k), (n[v + 2] = O), (n[v + 3] = M));
			}
		}
	},
	js = function (s, t, e) {
		const i = s.data,
			n = t.data,
			r = s.width,
			a = s.height,
			o = e.polarCenterX || r / 2,
			h = e.polarCenterY || a / 2;
		let l = Math.sqrt(o * o + h * h),
			c = r - o,
			f = a - h;
		const d = Math.sqrt(c * c + f * f);
		l = d > l ? d : l;
		const p = a,
			g = r,
			_ = 0;
		let b, y;
		for (c = 0; c < r; c += 1)
			for (f = 0; f < a; f += 1) {
				const S = c - o,
					C = f - h,
					v = (Math.sqrt(S * S + C * C) * p) / l;
				let G = ((Math.atan2(C, S) * 180) / Math.PI + 360 + _) % 360;
				((G = (G * g) / 360), (b = Math.floor(G)), (y = Math.floor(v)));
				let k = (y * r + b) * 4;
				const O = i[k + 0],
					M = i[k + 1],
					L = i[k + 2],
					N = i[k + 3];
				((k = (f * r + c) * 4), (n[k + 0] = O), (n[k + 1] = M), (n[k + 2] = L), (n[k + 3] = N));
			}
	},
	Ks = function (s) {
		const t = s.width,
			e = s.height;
		let i,
			n,
			r,
			a,
			o,
			h,
			l,
			c,
			f,
			d,
			p = Math.round(this.kaleidoscopePower());
		const g = Math.round(this.kaleidoscopeAngle()),
			_ = Math.floor((t * (g % 360)) / 360);
		if (p < 1) return;
		const b = m.createCanvasElement();
		((b.width = t), (b.height = e));
		const y = b.getContext('2d').getImageData(0, 0, t, e);
		(m.releaseCanvas(b), qs(s, y, { polarCenterX: t / 2, polarCenterY: e / 2 }));
		let S = t / Math.pow(2, p);
		for (; S <= 8; ) ((S = S * 2), (p -= 1));
		S = Math.ceil(S);
		let C = S,
			v = 0,
			G = C,
			k = 1;
		for (_ + S > t && ((v = C), (G = 0), (k = -1)), n = 0; n < e; n += 1)
			for (i = v; i !== G; i += k)
				((r = Math.round(i + _) % t),
					(f = (t * n + r) * 4),
					(o = y.data[f + 0]),
					(h = y.data[f + 1]),
					(l = y.data[f + 2]),
					(c = y.data[f + 3]),
					(d = (t * n + i) * 4),
					(y.data[d + 0] = o),
					(y.data[d + 1] = h),
					(y.data[d + 2] = l),
					(y.data[d + 3] = c));
		for (n = 0; n < e; n += 1)
			for (C = Math.floor(S), a = 0; a < p; a += 1) {
				for (i = 0; i < C + 1; i += 1)
					((f = (t * n + i) * 4),
						(o = y.data[f + 0]),
						(h = y.data[f + 1]),
						(l = y.data[f + 2]),
						(c = y.data[f + 3]),
						(d = (t * n + C * 2 - i - 1) * 4),
						(y.data[d + 0] = o),
						(y.data[d + 1] = h),
						(y.data[d + 2] = l),
						(y.data[d + 3] = c));
				C *= 2;
			}
		js(y, s, {});
	};
u.addGetterSetter(E, 'kaleidoscopePower', 2, P(), u.afterSetFilter);
u.addGetterSetter(E, 'kaleidoscopeAngle', 0, P(), u.afterSetFilter);
function ne(s, t, e) {
	let i = (e * s.width + t) * 4;
	const n = [];
	return (n.push(s.data[i++], s.data[i++], s.data[i++], s.data[i++]), n);
}
function Dt(s, t) {
	return Math.sqrt(Math.pow(s[0] - t[0], 2) + Math.pow(s[1] - t[1], 2) + Math.pow(s[2] - t[2], 2));
}
function $s(s) {
	const t = [0, 0, 0];
	for (let e = 0; e < s.length; e++) ((t[0] += s[e][0]), (t[1] += s[e][1]), (t[2] += s[e][2]));
	return ((t[0] /= s.length), (t[1] /= s.length), (t[2] /= s.length), t);
}
function Qs(s, t) {
	const e = ne(s, 0, 0),
		i = ne(s, s.width - 1, 0),
		n = ne(s, 0, s.height - 1),
		r = ne(s, s.width - 1, s.height - 1),
		a = t || 10;
	if (Dt(e, i) < a && Dt(i, r) < a && Dt(r, n) < a && Dt(n, e) < a) {
		const o = $s([i, e, r, n]),
			h = [];
		for (let l = 0; l < s.width * s.height; l++) {
			const c = Dt(o, [s.data[l * 4], s.data[l * 4 + 1], s.data[l * 4 + 2]]);
			h[l] = c < a ? 0 : 255;
		}
		return h;
	}
}
function Js(s, t) {
	for (let e = 0; e < s.width * s.height; e++) s.data[4 * e + 3] = t[e];
}
function Zs(s, t, e) {
	const i = [1, 1, 1, 1, 0, 1, 1, 1, 1],
		n = Math.round(Math.sqrt(i.length)),
		r = Math.floor(n / 2),
		a = [];
	for (let o = 0; o < e; o++)
		for (let h = 0; h < t; h++) {
			const l = o * t + h;
			let c = 0;
			for (let f = 0; f < n; f++)
				for (let d = 0; d < n; d++) {
					const p = o + f - r,
						g = h + d - r;
					if (p >= 0 && p < e && g >= 0 && g < t) {
						const _ = p * t + g,
							b = i[f * n + d];
						c += s[_] * b;
					}
				}
			a[l] = c === 2040 ? 255 : 0;
		}
	return a;
}
function tr(s, t, e) {
	const i = [1, 1, 1, 1, 1, 1, 1, 1, 1],
		n = Math.round(Math.sqrt(i.length)),
		r = Math.floor(n / 2),
		a = [];
	for (let o = 0; o < e; o++)
		for (let h = 0; h < t; h++) {
			const l = o * t + h;
			let c = 0;
			for (let f = 0; f < n; f++)
				for (let d = 0; d < n; d++) {
					const p = o + f - r,
						g = h + d - r;
					if (p >= 0 && p < e && g >= 0 && g < t) {
						const _ = p * t + g,
							b = i[f * n + d];
						c += s[_] * b;
					}
				}
			a[l] = c >= 1020 ? 255 : 0;
		}
	return a;
}
function er(s, t, e) {
	const i = [
			0.1111111111111111, 0.1111111111111111, 0.1111111111111111, 0.1111111111111111, 0.1111111111111111, 0.1111111111111111, 0.1111111111111111,
			0.1111111111111111, 0.1111111111111111
		],
		n = Math.round(Math.sqrt(i.length)),
		r = Math.floor(n / 2),
		a = [];
	for (let o = 0; o < e; o++)
		for (let h = 0; h < t; h++) {
			const l = o * t + h;
			let c = 0;
			for (let f = 0; f < n; f++)
				for (let d = 0; d < n; d++) {
					const p = o + f - r,
						g = h + d - r;
					if (p >= 0 && p < e && g >= 0 && g < t) {
						const _ = p * t + g,
							b = i[f * n + d];
						c += s[_] * b;
					}
				}
			a[l] = c;
		}
	return a;
}
const ir = function (s) {
	const t = this.threshold();
	let e = Qs(s, t);
	return (e && ((e = Zs(e, s.width, s.height)), (e = tr(e, s.width, s.height)), (e = er(e, s.width, s.height)), Js(s, e)), s);
};
u.addGetterSetter(E, 'threshold', 0, P(), u.afterSetFilter);
const nr = function (s) {
	const t = this.noise() * 255,
		e = s.data,
		i = e.length,
		n = t / 2;
	for (let r = 0; r < i; r += 4)
		((e[r + 0] += n - 2 * n * Math.random()), (e[r + 1] += n - 2 * n * Math.random()), (e[r + 2] += n - 2 * n * Math.random()));
};
u.addGetterSetter(E, 'noise', 0.2, P(), u.afterSetFilter);
const sr = function (s) {
	let t = Math.ceil(this.pixelSize()),
		e = s.width,
		i = s.height,
		n = Math.ceil(e / t),
		r = Math.ceil(i / t),
		a = s.data;
	if (t <= 0) {
		m.error('pixelSize value can not be <= 0');
		return;
	}
	for (let o = 0; o < n; o += 1)
		for (let h = 0; h < r; h += 1) {
			let l = 0,
				c = 0,
				f = 0,
				d = 0;
			const p = o * t,
				g = p + t,
				_ = h * t,
				b = _ + t;
			let y = 0;
			for (let S = p; S < g; S += 1)
				if (!(S >= e))
					for (let C = _; C < b; C += 1) {
						if (C >= i) continue;
						const v = (e * C + S) * 4;
						((l += a[v + 0]), (c += a[v + 1]), (f += a[v + 2]), (d += a[v + 3]), (y += 1));
					}
			((l = l / y), (c = c / y), (f = f / y), (d = d / y));
			for (let S = p; S < g; S += 1)
				if (!(S >= e))
					for (let C = _; C < b; C += 1) {
						if (C >= i) continue;
						const v = (e * C + S) * 4;
						((a[v + 0] = l), (a[v + 1] = c), (a[v + 2] = f), (a[v + 3] = d));
					}
		}
};
u.addGetterSetter(E, 'pixelSize', 8, P(), u.afterSetFilter);
const rr = function (s) {
	const t = Math.round(this.levels() * 254) + 1,
		e = s.data,
		i = e.length,
		n = 255 / t;
	for (let r = 0; r < i; r += 1) e[r] = Math.floor(e[r] / n) * n;
};
u.addGetterSetter(E, 'levels', 0.5, P(), u.afterSetFilter);
const ar = function (s) {
	const t = s.data,
		e = t.length,
		i = this.red(),
		n = this.green(),
		r = this.blue();
	for (let a = 0; a < e; a += 4) {
		const o = (0.34 * t[a] + 0.5 * t[a + 1] + 0.16 * t[a + 2]) / 255;
		((t[a] = o * i), (t[a + 1] = o * n), (t[a + 2] = o * r), (t[a + 3] = t[a + 3]));
	}
};
u.addGetterSetter(E, 'red', 0, function (s) {
	return ((this._filterUpToDate = !1), s > 255 ? 255 : s < 0 ? 0 : Math.round(s));
});
u.addGetterSetter(E, 'green', 0, function (s) {
	return ((this._filterUpToDate = !1), s > 255 ? 255 : s < 0 ? 0 : Math.round(s));
});
u.addGetterSetter(E, 'blue', 0, hi, u.afterSetFilter);
const or = function (s) {
	const t = s.data,
		e = t.length,
		i = this.red(),
		n = this.green(),
		r = this.blue(),
		a = this.alpha();
	for (let o = 0; o < e; o += 4) {
		const h = 1 - a;
		((t[o] = i * a + t[o] * h), (t[o + 1] = n * a + t[o + 1] * h), (t[o + 2] = r * a + t[o + 2] * h));
	}
};
u.addGetterSetter(E, 'red', 0, function (s) {
	return ((this._filterUpToDate = !1), s > 255 ? 255 : s < 0 ? 0 : Math.round(s));
});
u.addGetterSetter(E, 'green', 0, function (s) {
	return ((this._filterUpToDate = !1), s > 255 ? 255 : s < 0 ? 0 : Math.round(s));
});
u.addGetterSetter(E, 'blue', 0, hi, u.afterSetFilter);
u.addGetterSetter(E, 'alpha', 1, function (s) {
	return ((this._filterUpToDate = !1), s > 1 ? 1 : s < 0 ? 0 : s);
});
const hr = function (s) {
		const t = s.data,
			e = t.length;
		for (let i = 0; i < e; i += 4) {
			const n = t[i + 0],
				r = t[i + 1],
				a = t[i + 2];
			((t[i + 0] = Math.min(255, n * 0.393 + r * 0.769 + a * 0.189)),
				(t[i + 1] = Math.min(255, n * 0.349 + r * 0.686 + a * 0.168)),
				(t[i + 2] = Math.min(255, n * 0.272 + r * 0.534 + a * 0.131)));
		}
	},
	lr = function (s) {
		const e = s.data;
		for (let i = 0; i < e.length; i += 4) {
			const n = e[i],
				r = e[i + 1],
				a = e[i + 2];
			0.2126 * n + 0.7152 * r + 0.0722 * a >= 128 && ((e[i] = 255 - n), (e[i + 1] = 255 - r), (e[i + 2] = 255 - a));
		}
		return s;
	},
	cr = function (s) {
		const t = this.threshold() * 255,
			e = s.data,
			i = e.length;
		for (let n = 0; n < i; n += 1) e[n] = e[n] < t ? 0 : 255;
	};
u.addGetterSetter(E, 'threshold', 0.5, P(), u.afterSetFilter);
const ur = $e.Util._assign($e, {
	Arc: ot,
	Arrow: Ct,
	Circle: At,
	Ellipse: gt,
	Image: it,
	Label: Le,
	Tag: xt,
	Line: ht,
	Path: q,
	Rect: qt,
	RegularPolygon: pt,
	Ring: wt,
	Sprite: rt,
	Star: mt,
	Text: j,
	TextPath: J,
	Transformer: F,
	Wedge: lt,
	Filters: {
		Blur: Ns,
		Brightness: Bs,
		Brighten: Fs,
		Contrast: Hs,
		Emboss: Ws,
		Enhance: zs,
		Grayscale: Ys,
		HSL: Xs,
		HSV: Us,
		Invert: Vs,
		Kaleidoscope: Ks,
		Mask: ir,
		Noise: nr,
		Pixelate: sr,
		Posterize: rr,
		RGB: ar,
		RGBA: or,
		Sepia: hr,
		Solarize: lr,
		Threshold: cr
	}
});
export { ur as K, fr as i };
//# sourceMappingURL=DtH1sEIR.js.map
