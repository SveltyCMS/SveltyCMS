/**
 * @file src/routes/(app)/imageEditor/widgets/Crop/overlay.ts
 * @description Overlay for Konva
 *
 * Features:
 * - Create an overlay group (dark full-screen + cutout placeholder)
 */
import Konva from 'konva';

/** Create an overlay group (dark full-screen + cutout placeholder) */
export function createOverlayGroup(stage: Konva.Stage, cutout: Konva.Shape) {
	const sw = stage.width();
	const sh = stage.height();
	const g = new Konva.Group({ name: 'cropOverlayGroup' });
	const dark = new Konva.Rect({ x: 0, y: 0, width: sw, height: sh, fill: 'rgba(0,0,0,0.7)', listening: false });
	g.add(dark);
	g.add(cutout);
	g.cache({ x: 0, y: 0, width: sw, height: sh, pixelRatio: 1 });
	return g;
}
