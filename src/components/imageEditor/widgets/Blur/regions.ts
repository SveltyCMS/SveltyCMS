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
	overlayGroup: Konva.Group;
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
				fill: 'rgba(59, 130, 246, 0.2)', // style blue selection
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

		// Create Group for clipping
		this.overlayGroup = new Konva.Group({ listening: false });
		this.overlayGroup.add(this.overlay);

		// ensure no filters initially
		this.overlay.filters([]);
		// install clipFunc on GROUP
		this.overlayGroup.clipFunc(this.makeClipFunc());
		this.imageGroup.add(this.overlayGroup);

		// set predictable zIndex ordering within group
		this.imageNode.zIndex(0);
		this.overlayGroup.zIndex(1);
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

	// Update toolbar position (local space within imageGroup)
	private updateToolbarPosition() {
		if (!this.toolbar) return;
		const n = this.shapeNode;

		let localPt = { x: 0, y: 0 };
		if (n instanceof Konva.Rect) {
			// Bottom center of rect
			localPt = { x: n.width() / 2, y: n.height() + 20 };
		} else {
			// Bottom center of ellipse (radiusY is half-height)
			localPt = { x: 0, y: (n as Konva.Ellipse).radiusY() + 20 };
		}

		// Transform local point to parent (imageGroup) space
		// This accounts for rotation, scaling, and position of the shape
		const pos = n.getTransform().point(localPt);

		this.toolbar.position(pos);
		this.toolbar.rotation(n.rotation());

		this.layer.batchDraw();
	}

	// Update overlay clip and cache (local group logic)
	private updateOverlayClip() {
		// Both shape and overlay are in imageGroup, at same root level
		// They share the same coordinate system.
		const bounds = this.shapeNode.getSelfRect();

		// Buffer for the blur radius
		const padding = this.currentStrength * 2;

		// Since overlay and shape are siblings in imageGroup,
		// and overlay is matched to imageNode position...
		// We need the shape relative to overlay.
		const x = this.shapeNode.x() - this.overlay.x();
		const y = this.shapeNode.y() - this.overlay.y();

		const cacheRect = {
			x: x - padding,
			y: y - padding,
			width: bounds.width + padding * 2,
			height: bounds.height + padding * 2
		};

		if (this._cacheTimer) window.clearTimeout(this._cacheTimer);
		this._cacheTimer = window.setTimeout(() => {
			try {
				this.overlayGroup.clearCache();
				this.overlayGroup.cache(cacheRect);
				this.layer.batchDraw();
			} catch (e) {
				/* ignore cache errors */
			}
			this._cacheTimer = null;
		}, 0);

		this.layer.batchDraw();
	}

	// create a clipFunc (local sibling logic)
	private makeClipFunc(): (ctx: CanvasRenderingContext2D) => void {
		const shape = this.shapeNode;
		// const overlay = this.overlay;
		return (ctx: CanvasRenderingContext2D) => {
			// They are siblings in imageGroup.
			// Offset shape's local transform by overlay's position.
			const tr = shape.getTransform().copy();
			// tr.translate(-overlay.x(), -overlay.y()); // No longer needed as overlayGroup is at 0,0 relative to imageGroup parent

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
		this.currentPattern = pattern;
		this.overlay.filters([]);
		if (pattern === 'blur') {
			this.overlay.filters([Konva.Filters.Blur]);
		} else {
			this.overlay.filters([Konva.Filters.Pixelate]);
		}
		this.setStrength(this.currentStrength);
		this.updateOverlayClip(); // Triggers re-cache
	}

	// apply strength (fast)
	setStrength(strength: number) {
		this.currentStrength = strength;
		if (this.currentPattern === 'blur') {
			this.overlay.blurRadius(strength);
		} else {
			this.overlay.pixelSize(Math.max(1, Math.round(strength / 2)));
		}
		this.updateOverlayClip(); // Fast debounce cache
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
			// EXPLICIT HANDLES - Blue Circles
			anchorFill: '#3b82f6',
			anchorStroke: '#ffffff',
			anchorStrokeWidth: 2,
			anchorSize: 12, // Standard size
			anchorCornerRadius: 6,

			// EXPLICIT BORDER - Solid White
			borderStroke: '#ffffff',
			borderStrokeWidth: 1.5,
			borderDash: [],

			rotateEnabled: true,
			rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
			rotateAnchorOffset: 25,
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

		this.imageGroup.add(this.transformer); // ADDED TO GROUP
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

		this.imageGroup.add(this.toolbar); // ADDED TO GROUP
		this.toolbar.zIndex(10);
		this.updateToolbarPosition();
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
			this.transformer?.moveToTop();
			this.toolbar?.moveToTop();
			this.updateToolbarPosition();
		}
		this.layer.batchDraw();
	}

	// hide UI but keep overlay for baking
	hideUI() {
		this.transformer?.visible(false);
		this.toolbar?.visible(false);
		this.shapeNode.visible(false);
	}

	// clone overlay and its clipFunc for offscreen baking
	cloneForBake(): Konva.Group | null {
		try {
			const c = this.overlayGroup.clone();
			return c;
		} catch (e) {
			return null;
		}
	}

	public rotate(deg: number) {
		this.shapeNode.rotate(deg);
		this.updateToolbarPosition();
		this.updateOverlayClip();
		this.layer.batchDraw();
	}

	public flipX() {
		this.shapeNode.scaleX(this.shapeNode.scaleX() * -1);
		this.updateToolbarPosition();
		this.updateOverlayClip();
		this.layer.batchDraw();
	}

	// explicit destruction with listener removal
	destroy() {
		this.shapeNode.off('dragmove transform click tap');
		this.transformer?.destroy();
		this.toolbar?.destroy();
		this.overlayGroup.destroy();
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
