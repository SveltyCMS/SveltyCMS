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
import { imageEditorStore } from '@stores/imageEditorStore.svelte';

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
	private _onClone: (() => void) | null = null;

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

		const w = init.width ?? 160;
		const h = init.height ?? 120;

		// Positing relative to imageGroup center (0,0 is group center usually)
		// But imageNode is at (-w/2, -h/2).
		// Let's place it at 0,0 (center of image)
		const x = init.x ?? 0;
		const y = init.y ?? 0;

		// create visible wireframe shape
		if (init.shape === 'ellipse') {
			this.shapeNode = new Konva.Ellipse({
				x,
				y,
				radiusX: w / 2,
				radiusY: h / 2,
				stroke: 'white',
				strokeWidth: 1.5,
				draggable: true,
				name: 'blurShape'
			});
		} else {
			this.shapeNode = new Konva.Rect({
				x: x - w / 2,
				y: y - h / 2,
				width: w,
				height: h,
				stroke: 'white',
				strokeWidth: 1.5,
				fill: 'rgba(59, 130, 246, 0.2)', // Pintura-style blue selection
				draggable: true,
				name: 'blurShape'
			});
		}
		this.shapeNode.id(this.id);
		// ADD SHAPE TO GROUP
		this.imageGroup.add(this.shapeNode);

		// create overlay image (ideally a clone of current state)
		this.overlay = new Konva.Image({
			image: this.imageNode.image(),
			listening: false,
			name: 'blurOverlay',
			// Copy all visual attributes from the main image node
			x: this.imageNode.x(),
			y: this.imageNode.y(),
			width: this.imageNode.width(),
			height: this.imageNode.height(),
			scaleX: this.imageNode.scaleX(),
			scaleY: this.imageNode.scaleY(),
			rotation: this.imageNode.rotation(),
			cornerRadius: this.imageNode.cornerRadius()
		});

		// ensure no filters initially
		this.overlay.filters([]);
		// install clipFunc (local space since both are in same group)
		(this.overlay as any).clipFunc(this.makeClipFunc());
		this.imageGroup.add(this.overlay);

		// set predictable zIndex ordering within group
		this.imageNode.zIndex(0);
		this.overlay.zIndex(1);
		this.shapeNode.zIndex(2); // Shape node is now in imageGroup
		this.layer.batchDraw();

		// bind events (fast updates only)
		this.shapeNode.on('dragmove transform', () => {
			this.updateToolbarPosition();
			this.updateOverlayClip();
			this.layer.batchDraw();
		});

		// Trigger initial pattern/strength for immediate feedback
		this.setPattern(this.currentPattern);
		this.setStrength(this.currentStrength);
		this.shapeNode.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}

	// Update toolbar position to stay above the region
	private updateToolbarPosition() {
		if (!this.toolbar) return;
		// Get absolute center Top of the shape, then move up
		const bounds = this.shapeNode.getClientRect({ skipTransform: false });
		this.toolbar.position({
			x: bounds.x + bounds.width / 2,
			y: bounds.y - 45
		});
	}

	// Update overlay clip and cache during interactive movement
	private updateOverlayClip() {
		// Use relativeTo overlay to get pixel-perfect coordinates even if imageNode is scaled/rotated
		const bounds = this.shapeNode.getClientRect({ relativeTo: this.overlay });

		// Buffer for the blur radius
		const padding = this.currentStrength * 2;

		const cacheRect = {
			x: bounds.x - padding,
			y: bounds.y - padding,
			width: bounds.width + padding * 2,
			height: bounds.height + padding * 2
		};

		if (this._cacheTimer) window.clearTimeout(this._cacheTimer);
		this._cacheTimer = window.setTimeout(() => {
			try {
				this.overlay.clearCache();
				this.overlay.cache(cacheRect);
				this.layer.batchDraw();
			} catch (e) {
				/* ignore cache errors */
			}
			this._cacheTimer = null;
		}, 0);

		this.layer.batchDraw();
	}

	// create a clipFunc that maps the shape absolute transform to overlay space
	private makeClipFunc(): (ctx: CanvasRenderingContext2D) => void {
		const shape = this.shapeNode;
		const overlay = this.overlay;
		return (ctx: CanvasRenderingContext2D) => {
			// Get relative transform from shape back to overlay space
			const tr = shape.getAbsoluteTransform().copy();
			const overlayTr = overlay.getAbsoluteTransform().copy().invert();
			tr.multiply(overlayTr);

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
		// schedule a localized cache
		const bounds = this.shapeNode.getClientRect({ relativeTo: this.overlay });
		const padding = this.currentStrength * 2;
		const cacheRect = {
			x: bounds.x - padding,
			y: bounds.y - padding,
			width: bounds.width + padding * 2,
			height: bounds.height + padding * 2
		};

		if (this._cacheTimer) window.clearTimeout(this._cacheTimer);
		this._cacheTimer = window.setTimeout(() => {
			try {
				this.overlay.clearCache();
				this.overlay.cache(cacheRect);
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
		this.transformer = new Konva.Transformer({
			nodes: [this.shapeNode],
			// Explicitly force blue circular handles
			anchorFill: '#3b82f6',
			anchorStroke: '#ffffff',
			anchorStrokeWidth: 2,
			anchorSize: 12,
			anchorCornerRadius: 6,
			borderStroke: '#ffffff',
			borderStrokeWidth: 1.5,
			rotateEnabled: true,
			rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
			rotateAnchorOffset: 40,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			keepRatio: false,
			ignoreStroke: true,
			boundBoxFunc: (oldBox, newBox) => {
				return newBox.width < 10 || newBox.height < 10 ? oldBox : newBox;
			}
		});
		this.transformer.on('dragend transformend', () => {
			imageEditorStore.takeSnapshot();
		});

		this.layer.add(this.transformer);
		this.transformer.moveToTop();

		// Add dragend/transformend to take snapshot
		this.shapeNode.on('dragend transformend', () => {
			imageEditorStore.takeSnapshot();
		});

		// Create toolbar above the region
		this.createToolbar();
	}

	// Create toolbar with clone/delete icons
	private createToolbar() {
		if (this.toolbar) this.toolbar.destroy();

		const bounds = this.shapeNode.getClientRect();
		const toolbarY = bounds.y - 45;
		const toolbarX = bounds.x + bounds.width / 2;

		this.toolbar = new Konva.Group({
			x: toolbarX,
			y: toolbarY,
			name: 'blurToolbar'
		});

		// Background
		const bg = new Konva.Rect({
			x: -45,
			y: 0,
			width: 90,
			height: 36,
			fill: '#1f2937',
			cornerRadius: 8,
			shadowColor: 'black',
			shadowBlur: 10,
			shadowOpacity: 0.4
		});
		this.toolbar.add(bg);

		// Add icon (Plus)
		const addGroup = new Konva.Group({ x: -22, y: 18, cursor: 'pointer' });
		addGroup.add(
			new Konva.Path({
				data: 'M12 4v16m8-8H4',
				stroke: 'white',
				strokeWidth: 2,
				lineCap: 'round',
				scale: { x: 0.8, y: 0.8 },
				offset: { x: 12, y: 12 }
			})
		);
		addGroup.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onClone?.();
		});
		addGroup.on('mouseenter', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'pointer';
		});
		addGroup.on('mouseleave', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'crosshair';
		});
		this.toolbar.add(addGroup);

		// Delete icon (Trash)
		const deleteGroup = new Konva.Group({ x: 22, y: 18, cursor: 'pointer' });
		deleteGroup.add(
			new Konva.Path({
				data: 'M3 6h18M9 6v12M15 6v12M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
				stroke: 'white',
				strokeWidth: 2,
				scale: { x: 0.7, y: 0.7 },
				offset: { x: 12, y: 12 }
			})
		);
		deleteGroup.on('click tap', (e) => {
			e.cancelBubble = true;
			this.destroy();
		});
		deleteGroup.on('mouseenter', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'pointer';
		});
		deleteGroup.on('mouseleave', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'crosshair';
		});
		this.toolbar.add(deleteGroup);

		this.layer.add(this.toolbar);
		this.toolbar.zIndex(4);
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
	onClone(cb: () => void) {
		this._onClone = cb;
	}
}
