/**
 * @file src/components/imageEditor/widgets/Blur/regions.ts
 * @description BlurRegion class with improved performance and cleanup
 */

import Konva from 'konva';
import { imageEditorStore } from '@stores/imageEditorStore.svelte.ts';

export type BlurShape = 'rectangle' | 'ellipse';
export type BlurPattern = 'blur' | 'pixelate';

export interface RegionInit {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	shape?: BlurShape;
	pattern?: BlurPattern;
	strength?: number;
}

export interface SerializedRegion {
	id: string;
	shape: BlurShape;
	pattern: BlurPattern;
	strength: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

// Constants
const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 120;
const MIN_SIZE = 10;
const TOOLBAR_OFFSET = 45;
const CACHE_DEBOUNCE_MS = 50;
const DEFAULT_STRENGTH = 20;

/**
 * BlurRegion encapsulates a single blur/pixelate region
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

	private _cacheTimer: ReturnType<typeof setTimeout> | null = null;
	private _isDestroyed = false;

	constructor(opts: { id: string; layer: Konva.Layer; imageNode: Konva.Image; imageGroup: Konva.Group; init?: RegionInit }) {
		this.id = opts.id;
		this.layer = opts.layer;
		this.imageNode = opts.imageNode;
		this.imageGroup = opts.imageGroup;

		const init = opts.init || {};
		this.currentPattern = init.pattern || 'blur';
		this.currentStrength = init.strength || DEFAULT_STRENGTH;

		const w = init.width ?? DEFAULT_WIDTH;
		const h = init.height ?? DEFAULT_HEIGHT;
		const x = init.x ?? 0;
		const y = init.y ?? 0;

		// Create shape node
		this.shapeNode = this.createShapeNode(init.shape || 'rectangle', x, y, w, h);
		this.imageGroup.add(this.shapeNode);

		// Create overlay
		this.overlay = this.createOverlay();
		this.overlayGroup = new Konva.Group({ listening: false });
		this.overlayGroup.add(this.overlay);
		this.overlayGroup.clipFunc(this.makeClipFunc());
		this.imageGroup.add(this.overlayGroup);

		// Set z-indices
		this.updateZIndices();

		// Bind events
		this.bindEvents();

		// Apply initial effect
		this.setPattern(this.currentPattern);
		this.setStrength(this.currentStrength);

		this.layer.batchDraw();
	}

	private createShapeNode(shape: BlurShape, x: number, y: number, w: number, h: number): Konva.Rect | Konva.Ellipse {
		const commonProps = {
			stroke: 'white',
			strokeWidth: 1.5,
			draggable: true,
			name: 'blurShape'
		};

		if (shape === 'ellipse') {
			return new Konva.Ellipse({
				...commonProps,
				x,
				y,
				radiusX: w / 2,
				radiusY: h / 2,
				id: this.id
			});
		}

		return new Konva.Rect({
			...commonProps,
			x: x - w / 2,
			y: y - h / 2,
			width: w,
			height: h,
			fill: 'rgba(59, 130, 246, 0.2)',
			id: this.id
		});
	}

	private createOverlay(): Konva.Image {
		return new Konva.Image({
			image: this.imageNode.image(),
			listening: false,
			name: 'blurOverlay',
			x: this.imageNode.x(),
			y: this.imageNode.y(),
			width: this.imageNode.width(),
			height: this.imageNode.height(),
			scaleX: this.imageNode.scaleX(),
			scaleY: this.imageNode.scaleY(),
			rotation: this.imageNode.rotation(),
			cornerRadius: this.imageNode.cornerRadius()
		});
	}

	private bindEvents(): void {
		this.shapeNode.on('dragmove transform', () => {
			this.updateToolbarPosition();
			this.updateOverlayClip();
			this.layer.batchDraw();
		});

		this.shapeNode.on('click tap', (e: Konva.KonvaEventObject<MouseEvent>) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}

	private updateZIndices(): void {
		this.imageNode.zIndex(0);
		this.overlayGroup.zIndex(1);
		this.shapeNode.zIndex(2);
	}

	private updateToolbarPosition(): void {
		if (!this.toolbar || this._isDestroyed) return;

		const n = this.shapeNode;
		let localPt = { x: 0, y: 0 };

		if (n instanceof Konva.Rect) {
			localPt = { x: n.width() / 2, y: n.height() + 20 };
		} else {
			localPt = { x: 0, y: (n as Konva.Ellipse).radiusY() + 20 };
		}

		const pos = n.getTransform().point(localPt);
		this.toolbar.position(pos);
		this.toolbar.rotation(n.rotation());
	}

	private updateOverlayClip(): void {
		if (this._isDestroyed) return;

		const bounds = this.shapeNode.getSelfRect();
		const padding = this.currentStrength * 2;

		const x = this.shapeNode.x() - this.overlay.x();
		const y = this.shapeNode.y() - this.overlay.y();

		const cacheRect = {
			x: x - padding,
			y: y - padding,
			width: bounds.width + padding * 2,
			height: bounds.height + padding * 2
		};

		if (this._cacheTimer) {
			clearTimeout(this._cacheTimer);
		}

		this._cacheTimer = setTimeout(() => {
			if (this._isDestroyed) return;

			try {
				this.overlayGroup.clearCache();
				this.overlayGroup.cache(cacheRect);
				this.layer.batchDraw();
			} catch (e) {
				/* ignore cache errors */
			}
			this._cacheTimer = null;
		}, CACHE_DEBOUNCE_MS);

		// this.layer.batchDraw(); // Removed redundant draw call
	}

	private makeClipFunc(): (ctx: CanvasRenderingContext2D) => void {
		const shape = this.shapeNode;
		return (ctx: CanvasRenderingContext2D) => {
			const tr = shape.getTransform().copy();
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

	setPattern(pattern: BlurPattern): void {
		this.currentPattern = pattern;
		this.overlay.filters([]);

		if (pattern === 'blur') {
			this.overlay.filters([Konva.Filters.Blur]);
		} else {
			this.overlay.filters([Konva.Filters.Pixelate]);
		}

		this.setStrength(this.currentStrength);
		this.updateOverlayClip();
	}

	setStrength(strength: number): void {
		this.currentStrength = strength;

		if (this.currentPattern === 'blur') {
			this.overlay.blurRadius(strength);
		} else {
			this.overlay.pixelSize(Math.max(1, Math.round(strength / 2)));
		}

		this.updateOverlayClip();
	}

	finalize(): void {
		this.transformer = new Konva.Transformer({
			nodes: [this.shapeNode],
			anchorFill: '#3b82f6',
			anchorStroke: '#ffffff',
			anchorStrokeWidth: 2,
			anchorSize: 12,
			anchorCornerRadius: 6,
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
				return newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox;
			}
		});

		this.transformer.on('dragend transformend', () => {
			imageEditorStore.takeSnapshot();
		});

		this.imageGroup.add(this.transformer);
		this.transformer.moveToTop();

		this.shapeNode.on('dragend transformend', () => {
			imageEditorStore.takeSnapshot();
		});

		this.createToolbar();
	}

	private createToolbar(): void {
		if (this.toolbar) {
			this.toolbar.destroy();
		}

		const bounds = this.shapeNode.getClientRect();
		this.toolbar = new Konva.Group({
			x: bounds.x + bounds.width / 2,
			y: bounds.y - TOOLBAR_OFFSET,
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

		// Clone button
		this.addToolbarButton(-22, 'M12 4v16m8-8H4', () => this._onClone?.());

		// Delete button
		this.addToolbarButton(22, 'M3 6h18M9 6v12M15 6v12M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2', () => this.destroy());

		this.imageGroup.add(this.toolbar);
		this.toolbar.zIndex(10);
		this.updateToolbarPosition();
	}

	private addToolbarButton(x: number, pathData: string, onClick: () => void): void {
		const group = new Konva.Group({ x, y: 18, cursor: 'pointer' });

		group.add(
			new Konva.Path({
				data: pathData,
				stroke: 'white',
				strokeWidth: 2,
				lineCap: 'round',
				scale: { x: 0.7, y: 0.7 },
				offset: { x: 12, y: 12 }
			})
		);

		group.on('click tap', (e: Konva.KonvaEventObject<MouseEvent>) => {
			e.cancelBubble = true;
			onClick();
		});

		group.on('mouseenter', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'pointer';
		});

		group.on('mouseleave', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'crosshair';
		});

		this.toolbar!.add(group);
	}

	isTooSmall(): boolean {
		const n = this.shapeNode;
		if (n instanceof Konva.Ellipse) {
			return n.radiusX() < MIN_SIZE || n.radiusY() < MIN_SIZE;
		}
		return n.width() < MIN_SIZE * 2 || n.height() < MIN_SIZE * 2;
	}

	setActive(isActive: boolean): void {
		if (this.transformer) this.transformer.visible(isActive);
		if (this.toolbar) this.toolbar.visible(isActive);

		if (isActive) {
			this.transformer?.moveToTop();
			this.toolbar?.moveToTop();
			this.updateToolbarPosition();
		}

		this.layer.batchDraw();
	}

	hideUI(): void {
		this.transformer?.visible(false);
		this.toolbar?.visible(false);
		this.shapeNode.visible(false);
	}

	cloneForBake(): Konva.Group | null {
		try {
			return this.overlayGroup.clone();
		} catch (e) {
			console.error('[BlurRegion] Clone failed:', e);
			return null;
		}
	}

	rotate(deg: number): void {
		this.shapeNode.rotate(deg);
		this.updateToolbarPosition();
		this.updateOverlayClip();
		this.layer.batchDraw();
	}

	flipX(): void {
		this.shapeNode.scaleX(this.shapeNode.scaleX() * -1);
		this.updateToolbarPosition();
		this.updateOverlayClip();
		this.layer.batchDraw();
	}

	serialize(): SerializedRegion {
		const n = this.shapeNode;
		const bounds = n.getClientRect();

		return {
			id: this.id,
			shape: n instanceof Konva.Ellipse ? 'ellipse' : 'rectangle',
			pattern: this.currentPattern,
			strength: this.currentStrength,
			x: n.x(),
			y: n.y(),
			width: bounds.width,
			height: bounds.height,
			rotation: n.rotation(),
			scaleX: n.scaleX(),
			scaleY: n.scaleY()
		};
	}

	destroy(): void {
		if (this._isDestroyed) return;
		this._isDestroyed = true;

		if (this._cacheTimer) {
			clearTimeout(this._cacheTimer);
			this._cacheTimer = null;
		}

		this.shapeNode.off('dragmove transform click tap dragend transformend');
		this.transformer?.off('dragend transformend');
		this.transformer?.destroy();
		this.toolbar?.destroy();
		this.overlayGroup.destroy();
		this.shapeNode.destroy();

		this._onDestroy?.();
	}

	// Callbacks
	onSelect(cb: () => void): void {
		this._onSelect = cb;
	}

	onDestroy(cb: () => void): void {
		this._onDestroy = cb;
	}

	onClone(cb: () => void): void {
		this._onClone = cb;
	}
}
