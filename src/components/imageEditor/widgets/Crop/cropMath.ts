/**
 * @file src/routes/(app)/imageEditor/widgets/Crop/cropMath.ts
 * @description Crop math for Konva
 *
 * Features:
 * - Convert a client rect in stage space into image-local pixel rect
 */
import Konva from 'konva';

/** Convert a client rect in stage space into image-local pixel rect */
export function stageRectToImageRect(rect: { x: number; y: number; width: number; height: number }, imageNode: Konva.Image, imageGroup: Konva.Group) {
	const containerAbs = imageGroup.getAbsoluteTransform();
	const inv = containerAbs.copy().invert();
	const topLeft = inv.point({ x: rect.x, y: rect.y });
	const bottomRight = inv.point({ x: rect.x + rect.width, y: rect.y + rect.height });
	const imgW = imageNode.width();
	const imgH = imageNode.height();
	const offsetX = imgW / 2;
	const offsetY = imgH / 2;
	const relX = Math.max(0, Math.min(imgW, Math.round(topLeft.x + offsetX)));
	const relY = Math.max(0, Math.min(imgH, Math.round(topLeft.y + offsetY)));
	const relW = Math.max(1, Math.min(imgW - relX, Math.round(bottomRight.x - topLeft.x)));
	const relH = Math.max(1, Math.min(imgH - relY, Math.round(bottomRight.y - topLeft.y)));
	return { x: relX, y: relY, width: relW, height: relH };
}
