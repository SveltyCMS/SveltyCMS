/**
 * @file src/components/imageEditor/widgets/Crop/cropMath.ts
 * @description Crop coordinate transformation utilities
 */
import Konva from 'konva';

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Convert a client rect in stage space into image-local pixel coordinates
 *
 * @param rect - Rectangle in stage coordinates
 * @param imageNode - The image node
 * @param imageGroup - The image group containing transforms
 * @returns Rectangle in image-local pixel coordinates
 */
export function stageRectToImageRect(rect: Rect, imageNode: Konva.Image, imageGroup: Konva.Group): Rect {
	try {
		// Get inverse transform to convert from stage to imageGroup space
		const containerAbs = imageGroup.getAbsoluteTransform();
		const inv = containerAbs.copy().invert();

		// Transform crop rectangle corners
		const topLeft = inv.point({ x: rect.x, y: rect.y });
		const bottomRight = inv.point({
			x: rect.x + rect.width,
			y: rect.y + rect.height
		});

		// Image dimensions and offset
		const imgW = imageNode.width();
		const imgH = imageNode.height();
		const offsetX = imgW / 2;
		const offsetY = imgH / 2;

		// Convert to image-local coordinates (top-left origin)
		const relX = Math.max(0, Math.min(imgW, Math.round(topLeft.x + offsetX)));
		const relY = Math.max(0, Math.min(imgH, Math.round(topLeft.y + offsetY)));
		const relW = Math.max(1, Math.min(imgW - relX, Math.round(bottomRight.x - topLeft.x)));
		const relH = Math.max(1, Math.min(imgH - relY, Math.round(bottomRight.y - topLeft.y)));

		return { x: relX, y: relY, width: relW, height: relH };
	} catch (error) {
		console.error('[CropMath] Transform failed:', error);
		// Fallback to original rect
		return { ...rect };
	}
}

/**
 * Convert image-local rect to stage coordinates
 */
export function imageRectToStageRect(rect: Rect, imageNode: Konva.Image, imageGroup: Konva.Group): Rect {
	try {
		const transform = imageGroup.getAbsoluteTransform();
		const imgW = imageNode.width();
		const imgH = imageNode.height();

		// Convert from image-local to imageGroup space
		const topLeft = transform.point({
			x: rect.x - imgW / 2,
			y: rect.y - imgH / 2
		});

		const bottomRight = transform.point({
			x: rect.x + rect.width - imgW / 2,
			y: rect.y + rect.height - imgH / 2
		});

		return {
			x: topLeft.x,
			y: topLeft.y,
			width: bottomRight.x - topLeft.x,
			height: bottomRight.y - topLeft.y
		};
	} catch (error) {
		console.error('[CropMath] Transform failed:', error);
		return { ...rect };
	}
}

/**
 * Constrain crop rect to stay within image bounds
 */
export function constrainToImage(rect: Rect, imageNode: Konva.Image): Rect {
	const imgW = imageNode.width();
	const imgH = imageNode.height();

	return {
		x: Math.max(0, Math.min(imgW - 1, rect.x)),
		y: Math.max(0, Math.min(imgH - 1, rect.y)),
		width: Math.max(1, Math.min(imgW - rect.x, rect.width)),
		height: Math.max(1, Math.min(imgH - rect.y, rect.height))
	};
}

/**
 * Calculate optimal scale to fit cropped image in viewport
 */
export function calculateFitScale(cropRect: Rect, viewportWidth: number, viewportHeight: number, padding = 0.8): number {
	const scaleX = (viewportWidth * padding) / cropRect.width;
	const scaleY = (viewportHeight * padding) / cropRect.height;
	return Math.min(scaleX, scaleY);
}
