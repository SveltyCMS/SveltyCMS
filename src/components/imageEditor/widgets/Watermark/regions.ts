/**
 * @file src/routes/(app)/imageEditor/widgets/Watermark/region.ts
 * @description Regions for Watermark tool
 *
 * Features:
 * - WatermarkItem encapsulates a Konva.Image node, its transformer,
 * and the async logic to load an image from a File.
 */

import Konva from 'konva';

export class WatermarkItem {
	id: string;
	node: Konva.Image;
	layer: Konva.Layer;
	imageGroup: Konva.Group;
	private objectUrl: string | null = null; // To revoke on destroy

	private _onSelect: (() => void) | null = null;
	private _onDestroy: (() => void) | null = null;

	constructor(opts: { id: string; layer: Konva.Layer; imageGroup: Konva.Group }) {
		this.id = opts.id;
		this.layer = opts.layer;
		this.imageGroup = opts.imageGroup;

		// Create an empty Konva.Image node as a placeholder
		this.node = new Konva.Image({
			image: undefined,
			draggable: true,
			name: 'watermark'
		});
		this.layer.add(this.node);
		this.node.zIndex(5); // Watermarks go on top of annotations

		// Attach selection handler
		this.node.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}

	/**
	 * Asynchronously loads an image from a File object into the
	 * Konva.Image node.
	 */
	loadImage(file: File, options: { opacity: number; stageWidth: number; stageHeight: number }): Promise<void> {
		return new Promise((resolve, reject) => {
			this.objectUrl = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				// Calculate initial size (e.g., 20% of stage width)
				const scale = (options.stageWidth * 0.2) / img.width;
				const w = img.width * scale;
				const h = img.height * scale;

				// Position in center
				const x = options.stageWidth / 2 - w / 2;
				const y = options.stageHeight / 2 - h / 2;

				this.node.setAttrs({
					image: img,
					x: x,
					y: y,
					width: w,
					height: h,
					opacity: options.opacity
				});

				this.layer.batchDraw();
				resolve();
			};
			img.onerror = (err) => {
				reject(err);
			};
			img.src = this.objectUrl;
		});
	}

	setOpacity(opacity: number) {
		this.node.opacity(opacity);
		this.layer.batchDraw();
	}

	/**
	 * Snaps the watermark to a predefined position.
	 * (tl, tc, tr, cl, c, cr, bl, bc, br)
	 */
	snapTo(position: string) {
		const stage = this.layer.getStage();
		const imageRect = this.imageGroup.getClientRect();
		const nodeBox = this.node.getClientRect();

		const padding = 10; // 10px padding from edge

		let x: number, y: number;

		// Y-position
		if (position.startsWith('t')) {
			y = imageRect.y + padding;
		} else if (position.startsWith('c')) {
			y = imageRect.y + imageRect.height / 2 - nodeBox.height / 2;
		} else {
			// 'b'
			y = imageRect.y + imageRect.height - nodeBox.height - padding;
		}

		// X-position
		if (position.endsWith('l')) {
			x = imageRect.x + padding;
		} else if (position.endsWith('c')) {
			x = imageRect.x + imageRect.width / 2 - nodeBox.width / 2;
		} else {
			// 'r'
			x = imageRect.x + imageRect.width - nodeBox.width - padding;
		}

		// Need to account for stage transform
		const stageAbs = stage.getAbsoluteTransform().copy().invert();
		const finalPos = stageAbs.point({ x, y });

		this.node.position(finalPos);
		this.layer.batchDraw();
	}

	disableInteraction() {
		this.node.draggable(false);
	}

	destroy() {
		this.node.off('click tap');
		this.node.destroy();
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
		}
		this._onDestroy?.();
	}

	// --- Event Callbacks ---
	onSelect(cb: () => void) {
		this._onSelect = cb;
	}
	onDestroy(cb: () => void) {
		this._onDestroy = cb;
	}
}
