/**
 * @file src/components/imageEditor/widgets/Crop/highlight.ts
 * @description Sync overlay cutout with crop shape transform
 */
import Konva from 'konva';

/**
 * Synchronizes the overlay cutout with the crop shape's current transform
 *
 * @param overlayGroup - The overlay group containing the cutout
 * @param shape - The crop shape (Rect or Circle)
 * @param shouldCache - Whether to re-cache the overlay (expensive)
 */
export function syncHighlight(overlayGroup: Konva.Group, shape: Konva.Rect | Konva.Circle, shouldCache = true): void {
	const cutout = overlayGroup.findOne('.cropCut') as Konva.Rect | Konva.Circle;
	if (!cutout) return;

	try {
		if (shape instanceof Konva.Circle && cutout instanceof Konva.Circle) {
			// Sync circle properties
			cutout.setAttrs({
				x: shape.x(),
				y: shape.y(),
				radius: shape.radius() * shape.scaleX()
			});
		} else if (shape instanceof Konva.Rect && cutout instanceof Konva.Rect) {
			// Sync rectangle properties
			cutout.setAttrs({
				x: shape.x(),
				y: shape.y(),
				width: shape.width() * shape.scaleX(),
				height: shape.height() * shape.scaleY(),
				rotation: shape.rotation()
			});
		}

		if (shouldCache) {
			const stage = overlayGroup.getStage();
			if (stage) {
				overlayGroup.clearCache();
				overlayGroup.cache({
					x: 0,
					y: 0,
					width: stage.width(),
					height: stage.height(),
					pixelRatio: 1
				});
			}
		}
	} catch (error) {
		console.warn('[Crop] Failed to sync highlight:', error);
	}
}
