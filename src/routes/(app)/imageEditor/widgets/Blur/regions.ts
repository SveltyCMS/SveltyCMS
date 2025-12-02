/**
 * @files src/routes/(app)/imageEditor/widgets/Blur/regions.ts
 * @description BlurRegion encapsulates Konva nodes, clip mapping, caching strategy,
 * and lifecycle for one blur/pixelate region.
 *
 * Features:
 * - Rectangle and ellipse shapes
 * - Blur and pixelate patterns
 * - Interactive resizing and dragging
 * - Caching strategy for performance
 * - Fast updates for interactive feel
 */

import Konva from 'konva';

export type BlurShape = 'rectangle' | 'ellipse';
export type BlurPattern = 'blur' | 'pixelate';
export type RegionInit = { x?: number; y?: number; width?: number; height?: number; shape?: BlurShape; pattern?: BlurPattern; strength?: number };

/**
 * BlurRegion encapsulates Konva nodes, clip mapping, caching strategy,
 * and lifecycle for one blur/pixelate region.
 */
export class BlurRegion {
	id: string;
	shapeNode: Konva.Rect | Konva.Ellipse;
	overlay: Konva.Image;
	transformer?: Konva.Transformer;
	toolbar?: Konva.Group;
	private layer: Konva.Layer;
	private imageNode: Konva.Image;
	private imageGroup: Konva.Group;
	private currentPattern: BlurPattern;
	private currentStrength: number;

	private _onSelect: (() => void) | null = null;
	private _onDestroy: (() => void) | null = null;

	// cache debounce timer per-region
	private _cacheTimer: number | null = null;

	constructor(opts: { id: string; layer: Konva.Layer; imageNode: Konva.Image; imageGroup: Konva.Group; init?: RegionInit }) {
		this.id = opts.id;
		this.layer = opts.layer;
		this.imageNode = opts.imageNode;
		this.imageGroup = opts.imageGroup;
		const init = opts.init || {};
		this.currentPattern = init.pattern || 'blur';
		this.currentStrength = init.strength || 20;

		const w = init.width ?? 200;
		const h = init.height ?? 150;
		const stage = this.layer.getStage();
		const x = init.x ?? (stage ? stage.width() / 2 - w / 2 : 0);
		const y = init.y ?? (stage ? stage.height() / 2 - h / 2 : 0);

		// create visible wireframe shape
		if (init.shape === 'ellipse') {
			this.shapeNode = new Konva.Ellipse({
				x: x + w / 2,
				y: y + h / 2,
				radiusX: w / 2,
				radiusY: h / 2,
				stroke: 'white',
				strokeWidth: 2,
				dash: [5, 5],
				draggable: true,
				name: 'blurShape'
			});
		} else {
			this.shapeNode = new Konva.Rect({
				x,
				y,
				width: w,
				height: h,
				stroke: 'white',
				strokeWidth: 2,
				dash: [5, 5],
				draggable: true,
				name: 'blurShape'
			});
		}
		this.shapeNode.id(this.id);
		this.layer.add(this.shapeNode);

		// create overlay image (unfiltered first)
		this.overlay = new Konva.Image({
			image: this.imageNode.image(),
			listening: false,
			name: 'blurOverlay'
		});
		// copy positional transforms: apply group then node attrs so overlay aligns
		(this.overlay as any).setAttrs(this.imageGroup.getAttrs());
		(this.overlay as any).setAttrs(this.imageNode.getAttrs());

		// ensure no filters initially
		this.overlay.filters([]);
		// install clipFunc mapping shape absolute transform to overlay space
		(this.overlay as any).clipFunc(this.makeClipFunc());
		this.layer.add(this.overlay);

		// set predictable zIndex ordering
		this.imageGroup.zIndex(0);
		this.overlay.zIndex(1);
		this.shapeNode.zIndex(2);
		this.layer.batchDraw();

		// bind events (fast updates only)
		this.shapeNode.on('dragmove transform', () => {
			this.layer.batchDraw();
		});
		this.shapeNode.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}

	// create a clipFunc that maps the shape absolute transform to overlay space
	private makeClipFunc(): (ctx: CanvasRenderingContext2D) => void {
		const shape = this.shapeNode;
		return (ctx: CanvasRenderingContext2D) => {
			const tr = shape.getAbsoluteTransform();
			const m = tr.m;
			ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
			if (shape instanceof Konva.Ellipse) {
				ctx.beginPath();
				ctx.ellipse(0, 0, shape.radiusX(), shape.radiusY(), 0, 0, Math.PI * 2);
				ctx.closePath();
			} else {
				ctx.beginPath();
				ctx.rect(0, 0, shape.width(), shape.height());
				ctx.closePath();
			}
		};
	}

	// set filter pattern and perform necessary re-cache (slow)
	setPattern(pattern: BlurPattern) {
		// Always (re)apply filters so first-time regions get filters too
		this.currentPattern = pattern;
		this.overlay.filters([]);
		if (pattern === 'blur') {
			this.overlay.filters([Konva.Filters.Blur]);
			this.setStrength(this.currentStrength);
		} else {
			this.overlay.filters([Konva.Filters.Pixelate]);
			this.setStrength(this.currentStrength);
		}
		// clear+cache because filter array changed
		try {
			this.overlay.clearCache();
		} catch (e) {
			/* ignore */
		}
		this.overlay.cache();
		this.layer.batchDraw();
	}

	// apply strength (fast) without caching to keep interactive feel
	setStrength(strength: number) {
		this.currentStrength = strength;
		if (this.currentPattern === 'blur') {
			this.overlay.blurRadius(strength);
			this.overlay.pixelSize(1);
		} else {
			this.overlay.pixelSize(Math.max(1, Math.round(strength / 2)));
			this.overlay.blurRadius(0);
		}
		// schedule a cache in case user stops moving the slider quickly
		if (this._cacheTimer) window.clearTimeout(this._cacheTimer);
		this._cacheTimer = window.setTimeout(() => {
			try {
				this.overlay.cache();
			} catch (e) {
				/* ignore cache errors */
			}
			this._cacheTimer = null;
			this.layer.batchDraw();
		}, 140);
	}

	// fast resize during drawing (no cache)
	resizeFromStart(start: { x: number; y: number }, pos: { x: number; y: number }) {
		const width = pos.x - start.x;
		const height = pos.y - start.y;
		if (this.shapeNode instanceof Konva.Ellipse) {
			this.shapeNode.setAttrs({
				x: start.x + width / 2,
				y: start.y + height / 2,
				radiusX: Math.abs(width / 2),
				radiusY: Math.abs(height / 2)
			});
		} else {
			this.shapeNode.setAttrs({
				x: width > 0 ? start.x : pos.x,
				y: height > 0 ? start.y : pos.y,
				width: Math.abs(width),
				height: Math.abs(height)
			});
		}
	}

	// finalize region and attach a transformer (fast)
	finalize() {
		if (this.transformer) this.transformer.destroy();
		this.transformer = new Konva.Transformer({
			nodes: [this.shapeNode],
			rotateEnabled: true,
			anchorFill: '#4f46e5',
			anchorSize: 10,
			borderDash: [5, 5],
			borderStroke: 'white',
			anchorStroke: 'white',
			boundBoxFunc: (oldBox, newBox) => {
				return newBox.width < 20 || newBox.height < 20 ? oldBox : newBox;
			}
		});
		this.layer.add(this.transformer);
		this.transformer.zIndex(3);
		this.transformer.moveToTop();
	}

	// detect tiny regions
	isTooSmall(): boolean {
		const n = this.shapeNode;
		if (n instanceof Konva.Ellipse) return n.radiusX() < 10 || n.radiusY() < 10;
		return n.width() < 20 || n.height() < 20;
	}

	// set active UI state
	setActive(isActive: boolean) {
		if (this.transformer) this.transformer.visible(isActive);
		if (this.toolbar) this.toolbar.visible(isActive);
		if (isActive) {
			this.shapeNode.zIndex(2);
			this.transformer?.zIndex(3);
			this.toolbar?.zIndex(4);
		}
	}

	// hide UI but keep overlay for baking
	hideUI() {
		this.transformer?.visible(false);
		this.toolbar?.visible(false);
		this.shapeNode.visible(false);
	}

	// clone overlay and its clipFunc for offscreen baking
	cloneForBake(): Konva.Image | null {
		try {
			const c = this.overlay.clone({ listening: false });
			(c as any).clipFunc((this.overlay as any).clipFunc());
			return c;
		} catch (e) {
			return null;
		}
	}

	// explicit destruction with listener removal
	destroy() {
		this.shapeNode.off('dragmove transform click tap');
		this.transformer?.destroy();
		this.toolbar?.destroy();
		this.overlay.destroy();
		this.shapeNode.destroy();
		this._onDestroy?.();
	}

	// callbacks
	onSelect(cb: () => void) {
		this._onSelect = cb;
	}
	onDestroy(cb: () => void) {
		this._onDestroy = cb;
	}
}
