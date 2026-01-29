/**
 * @file src/components/imageEditor/widgets/Watermark/regions.ts
 * @description Enhanced watermark item with text and advanced features
 */

import Konva from 'konva';

export type WatermarkType = 'image' | 'text';

export interface WatermarkOptions {
	opacity?: number;
	stageWidth: number;
	stageHeight: number;
	tiled?: boolean;
	rotation?: number;
}

export interface TextWatermarkOptions extends WatermarkOptions {
	text: string;
	fontSize?: number;
	fontFamily?: string;
	color?: string;
}

/**
 * WatermarkItem - Supports both image and text watermarks
 */
export class WatermarkItem {
	id: string;
	type: WatermarkType;
	node: Konva.Image | Konva.Text;
	layer: Konva.Layer;
	imageGroup: Konva.Group;
	tileGroup?: Konva.Group;

	private objectUrl: string | null = null;
	private _onSelect: (() => void) | null = null;
	private _onDestroy: (() => void) | null = null;
	private _isTiled = false;

	constructor(opts: { id: string; type: WatermarkType; layer: Konva.Layer; imageGroup: Konva.Group }) {
		this.id = opts.id;
		this.type = opts.type;
		this.layer = opts.layer;
		this.imageGroup = opts.imageGroup;

		// Create appropriate node based on type
		if (opts.type === 'image') {
			this.node = new Konva.Image({
				image: undefined,
				draggable: true,
				name: 'watermark-image'
			});
		} else {
			this.node = new Konva.Text({
				text: '',
				draggable: true,
				name: 'watermark-text',
				fill: 'white',
				stroke: 'black',
				strokeWidth: 1,
				fontSize: 48,
				fontFamily: 'Arial',
				align: 'center',
				shadowColor: 'black',
				shadowBlur: 4,
				shadowOffset: { x: 2, y: 2 },
				shadowOpacity: 0.5
			});
		}

		this.layer.add(this.node);
		this.node.zIndex(5);

		this.node.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}

	/**
	 * Load image watermark
	 */
	loadImage(file: File, options: WatermarkOptions): Promise<void> {
		if (this.type !== 'image') {
			return Promise.reject(new Error('Cannot load image on text watermark'));
		}

		return new Promise((resolve, reject) => {
			this.objectUrl = URL.createObjectURL(file);
			const img = new Image();

			img.onload = () => {
				const scale = (options.stageWidth * 0.2) / img.width;
				const w = img.width * scale;
				const h = img.height * scale;

				const x = options.stageWidth / 2 - w / 2;
				const y = options.stageHeight / 2 - h / 2;

				(this.node as Konva.Image).setAttrs({
					image: img,
					x,
					y,
					width: w,
					height: h,
					opacity: options.opacity ?? 0.8,
					rotation: options.rotation ?? 0
				});

				if (options.tiled) {
					this.enableTiling(options);
				}

				this.layer.batchDraw();
				resolve();
			};

			img.onerror = (err) => reject(err);
			img.src = this.objectUrl;
		});
	}

	/**
	 * Create text watermark
	 */
	createText(options: TextWatermarkOptions): void {
		if (this.type !== 'text') {
			throw new Error('Cannot create text on image watermark');
		}

		const textNode = this.node as Konva.Text;
		textNode.setAttrs({
			text: options.text,
			fontSize: options.fontSize ?? 48,
			fontFamily: options.fontFamily ?? 'Arial',
			fill: options.color ?? 'white',
			opacity: options.opacity ?? 0.8,
			rotation: options.rotation ?? 0
		});

		// Center on stage
		const x = options.stageWidth / 2 - textNode.width() / 2;
		const y = options.stageHeight / 2 - textNode.height() / 2;
		textNode.position({ x, y });

		if (options.tiled) {
			this.enableTiling(options);
		}

		this.layer.batchDraw();
	}

	/**
	 * Enable tiling - creates a repeating pattern
	 */
	enableTiling(options: WatermarkOptions): void {
		if (this._isTiled) return;
		this._isTiled = true;

		this.tileGroup = new Konva.Group({
			listening: false,
			name: 'watermark-tiles'
		});

		const nodeBox = this.node.getClientRect();
		const spacing = Math.max(nodeBox.width, nodeBox.height) * 1.5;

		// Create grid of watermarks
		for (let x = 0; x < options.stageWidth + spacing; x += spacing) {
			for (let y = 0; y < options.stageHeight + spacing; y += spacing) {
				if (x === this.node.x() && y === this.node.y()) continue; // Skip original

				const clone = this.node.clone({
					x,
					y,
					listening: false,
					draggable: false
				});
				this.tileGroup.add(clone);
			}
		}

		this.layer.add(this.tileGroup);
		this.tileGroup.moveToBottom();
		this.layer.batchDraw();
	}

	/**
	 * Disable tiling
	 */
	disableTiling(): void {
		if (!this._isTiled) return;
		this._isTiled = false;

		this.tileGroup?.destroy();
		this.tileGroup = undefined;
		this.layer.batchDraw();
	}

	/**
	 * Toggle tiling
	 */
	toggleTiling(options: WatermarkOptions): void {
		if (this._isTiled) {
			this.disableTiling();
		} else {
			this.enableTiling(options);
		}
	}

	/**
	 * Set opacity
	 */
	setOpacity(opacity: number): void {
		this.node.opacity(opacity);

		// Update tiles
		if (this.tileGroup) {
			this.tileGroup.getChildren().forEach((child) => {
				child.opacity(opacity);
			});
		}

		this.layer.batchDraw();
	}

	/**
	 * Set size (scale)
	 */
	setSize(percentage: number): void {
		const scale = percentage / 100;
		this.node.scale({ x: scale, y: scale });
		this.layer.batchDraw();
	}

	/**
	 * Snap to position
	 */
	snapTo(position: string): void {
		const stage = this.layer.getStage();
		if (!stage) return;

		const imageRect = this.imageGroup.getClientRect();
		const nodeBox = this.node.getClientRect();
		const padding = 20;

		let x: number, y: number;

		// Parse position (e.g., "northwest", "center", "southeast")
		const vertical = position.includes('north') ? 'top' : position.includes('south') ? 'bottom' : 'middle';
		const horizontal = position.includes('west') ? 'left' : position.includes('east') ? 'right' : 'center';

		// Y-position
		if (vertical === 'top') {
			y = imageRect.y + padding;
		} else if (vertical === 'middle') {
			y = imageRect.y + imageRect.height / 2 - nodeBox.height / 2;
		} else {
			y = imageRect.y + imageRect.height - nodeBox.height - padding;
		}

		// X-position
		if (horizontal === 'left') {
			x = imageRect.x + padding;
		} else if (horizontal === 'center') {
			x = imageRect.x + imageRect.width / 2 - nodeBox.width / 2;
		} else {
			x = imageRect.x + imageRect.width - nodeBox.width - padding;
		}

		// Transform to stage coordinates
		const stageAbs = stage.getAbsoluteTransform().copy().invert();
		const finalPos = stageAbs.point({ x, y });

		this.node.position(finalPos);
		this.layer.batchDraw();
	}

	/**
	 * Disable interaction for baking
	 */
	disableInteraction(): void {
		this.node.draggable(false);
		this.node.listening(false);
	}

	/**
	 * Cleanup and destroy
	 */
	destroy(): void {
		this.node.off('click tap');
		this.node.destroy();
		this.tileGroup?.destroy();

		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
		}

		this._onDestroy?.();
	}

	// Event callbacks
	onSelect(cb: () => void): void {
		this._onSelect = cb;
	}

	onDestroy(cb: () => void): void {
		this._onDestroy = cb;
	}

	get isTiled(): boolean {
		return this._isTiled;
	}
}
