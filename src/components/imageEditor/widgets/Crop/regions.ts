/**
 * @file src/routes/(app)/imageEditor/widgets/Crop/region.ts
 * @description Regions for Crop tool
 *
 * Features:
 * - CropRegion encapsulates a single crop UI: overlay (cutout), tool border, transformer.
 */
import Konva from 'konva';
import { parseAspectRatio } from './aspect';
import { syncHighlight } from './highlight';

export type CropShape = 'rectangle' | 'square' | 'circular';
export type RegionInit = { x?: number; y?: number; width?: number; height?: number; shape?: CropShape; aspect?: string };

/**
 * CropRegion encapsulates a single crop UI: overlay (cutout), tool border, transformer.
 */
export class CropRegion {
	id: string; // region id
	layer: Konva.Layer; // owning layer
	imageNode: Konva.Image; // reference to image node
	imageGroup: Konva.Group; // reference to image group

	shape: Konva.Rect | Konva.Circle; // visible crop tool
	overlayGroup: Konva.Group; // cached overlay group that holds dark overlay + cutout
	transformer?: Konva.Transformer; // transformer for resize/rotate
	private aspect: string | null = null; // aspect ratio string

	// --- FIX: Event callback properties ---
	private _onTransform: (() => void) | null = null;
	private _onTransformEnd: (() => void) | null = null;
	private _onDestroy: (() => void) | null = null;

	constructor(opts: { id: string; layer: Konva.Layer; imageNode: Konva.Image; imageGroup: Konva.Group; init?: RegionInit }) {
		this.id = opts.id;
		this.layer = opts.layer;
		this.imageNode = opts.imageNode;
		this.imageGroup = opts.imageGroup;
		const init = opts.init || {};

		this.aspect = init.aspect ?? null;

		// create overlay group and shape
		this.overlayGroup = new Konva.Group({ name: 'cropOverlayGroup' });

		// create dark full-screen rect (will be cached)
		const stage = this.layer.getStage();
		const sw = stage?.width() ?? 0;
		const sh = stage?.height() ?? 0;

		const dark = new Konva.Rect({ x: 0, y: 0, width: sw, height: sh, fill: 'rgba(0,0,0,0.7)', listening: false, name: 'cropOverlay' });
		this.overlayGroup.add(dark);

		// compute initial size & center inside imageGroup visible area
		const groupRect = this.imageGroup.getClientRect();
		const size = Math.min(groupRect.width, groupRect.height) * 0.8;
		const cx = groupRect.x + groupRect.width / 2;
		const cy = groupRect.y + groupRect.height / 2;

		let shapeWidth: number, shapeHeight: number;
		const ratio = parseAspectRatio(this.aspect);

		if (ratio) {
			shapeWidth = size;
			shapeHeight = size / ratio;
		} else {
			shapeWidth = size;
			shapeHeight = size * 0.75; // Default freeform
		}

		// create cutout as circle or rect inside overlay group
		if (init.shape === 'circular') {
			const radius = size / 2;
			const cut = new Konva.Circle({
				x: cx,
				y: cy,
				radius: radius,
				fill: 'black',
				globalCompositeOperation: 'destination-out',
				listening: false,
				name: 'cropCut'
			});
			this.overlayGroup.add(cut);
			this.shape = new Konva.Circle({ x: cx, y: cy, radius: radius, stroke: 'white', strokeWidth: 3, draggable: true, name: 'cropTool' });
		} else {
			const cut = new Konva.Rect({
				x: cx - shapeWidth / 2,
				y: cy - shapeHeight / 2,
				width: shapeWidth,
				height: shapeHeight,
				fill: 'black',
				globalCompositeOperation: 'destination-out',
				listening: false,
				name: 'cropCut'
			});
			this.overlayGroup.add(cut);
			this.shape = new Konva.Rect({
				x: cx - shapeWidth / 2,
				y: cy - shapeHeight / 2,
				width: shapeWidth,
				height: shapeHeight,
				stroke: 'white',
				strokeWidth: 3,
				draggable: true,
				name: 'cropTool'
			});
		}

		// cache overlay group to make globalCompositeOperation effect efficient
		this.overlayGroup.cache({ x: 0, y: 0, width: sw, height: sh, pixelRatio: 1 });
		this.layer.add(this.overlayGroup);
		this.layer.add(this.shape);

		// layering: ensure imageGroup at bottom, overlay above image and shape above overlay
		this.imageGroup.zIndex(0);
		this.overlayGroup.zIndex(1);
		this.shape.zIndex(2);

		// ** FIX: Event wiring **
		// Wire up events to the internal callbacks
		this.shape.on('dragmove transform', () => {
			this._onTransform?.();
		});
		this.shape.on('dragend transformend', () => {
			this._onTransformEnd?.();
		});
	}

	// ** FIX: Use the 'highlight.ts' util **
	// one-line comment: update cutout to match shape transform
	updateCutout(shouldCache = true) {
		syncHighlight(this.overlayGroup, this.shape, shouldCache);
	}

	// ** NEW: Helper to re-center region **
	centerIn(rect: { x: number; y: number; width: number; height: number }) {
		const cx = rect.x + rect.width / 2;
		const cy = rect.y + rect.height / 2;
		this.shape.position({ x: cx, y: cy });
		this.transformer?.forceUpdate();
	}

	// one-line comment: attach transformer with aspect handling
	attachTransformer() {
		if (this.transformer) this.transformer.destroy();
		const ratio = parseAspectRatio(this.aspect ?? 'free');
		const keepRatio = this.shape instanceof Konva.Circle || this.aspect === '1:1' || (ratio !== null && typeof ratio === 'number');

		this.transformer = new Konva.Transformer({
			nodes: [this.shape],
			keepRatio: keepRatio,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			rotateEnabled: false, // Rotation is handled by the main tool
			anchorSize: 10,
			borderStroke: 'white',
			anchorStroke: 'white',
			anchorFill: '#4f46e5',
			boundBoxFunc: (oldBox, newBox) => {
				if (newBox.width < 30 || newBox.height < 30) return oldBox;
				// Enforce aspect ratio if set
				if (ratio && keepRatio && this.shape instanceof Konva.Rect) {
					newBox.height = newBox.width / ratio;
				}
				return newBox;
			}
		});
		this.layer.add(this.transformer);
		this.transformer.zIndex(3);
		this.transformer.moveToTop();
	}

	// one-line comment: hide UI for baking
	hideUI() {
		this.transformer?.visible(false);
		this.shape.visible(false);
		this.overlayGroup.visible(false); // Hide the whole overlay
		this.layer.batchDraw();
	}

	// one-line comment: destroy region and call destructor
	destroy() {
		this.shape.off('dragmove transform dragend transformend');
		this.transformer?.destroy();
		this.overlayGroup.destroy();
		this.shape.destroy();
		this._onDestroy?.();
	}

	// --- FIX: Expose event setters ---
	onTransform(cb: () => void) {
		this._onTransform = cb;
	}
	onTransformEnd(cb: () => void) {
		this._onTransformEnd = cb;
	}
	onDestroy(cb: () => void) {
		this._onDestroy = cb;
	}
}

export default CropRegion;
