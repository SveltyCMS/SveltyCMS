/**
 * @file src/routes/(app)/imageEditor/widgets/Crop/highlight.ts
 * @description Highlight for Konva
 *
 * Features:
 * - Syncs the overlay cutout with the visible crop tool; optionally re-cache
 */
import Konva from 'konva';

/** Syncs the overlay cutout with the visible crop tool; optionally re-cache */
export function syncHighlight(overlayGroup: Konva.Group, cropTool: Konva.Shape, shouldCache = true) {
	const cut = overlayGroup.findOne('.cropCut') as Konva.Shape | undefined;
	if (!cut) return;
	if (cropTool instanceof Konva.Circle && cut instanceof Konva.Circle) {
		cut.position(cropTool.position());
		cut.radius((cropTool as Konva.Circle).radius());
		cut.rotation(cropTool.rotation());
	} else if (cropTool instanceof Konva.Rect && cut instanceof Konva.Rect) {
		cut.position(cropTool.position());
		cut.width((cropTool as Konva.Rect).width());
		cut.height((cropTool as Konva.Rect).height());
		cut.rotation(cropTool.rotation());
	}
	if (shouldCache) {
		const s = overlayGroup.getStage();
		overlayGroup.cache({ x: 0, y: 0, width: s?.width() ?? 0, height: s?.height() ?? 0, pixelRatio: 1 });
	}
	overlayGroup.getLayer()?.batchDraw();
}
