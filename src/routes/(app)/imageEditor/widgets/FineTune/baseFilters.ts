/**
 * @file src/routes/(app)/imageEditor/widgets/FineTune/filters/baseFilters.ts
 * @description Applies standard Konva provided filters.
 *
 * Features:
 * - Applies standard Konva provided filters.
 */
import Konva from 'konva';
import type { Adjustments } from './adjustments';

/**
 * Applies fast, Konva-native filters (non-pixel-looping)
 * to the image node.
 */
export function applyBaseFilters(node: Konva.Image, adj: Adjustments) {
	node.brightness(adj.brightness / 100);
	node.contrast(adj.contrast / 100);

	// Combine saturation and vibrance
	// Vibrance is a "smart" saturation, apply it at a lower intensity
	const combinedSaturation = (adj.saturation + adj.vibrance * 0.7) / 100;
	node.saturation(combinedSaturation);

	// Temperature is just a hue shift
	const combinedHue = adj.temperature * 0.1; // Small shifts
	node.hue(combinedHue);

	// Konva has HSL filters, but they are often less intuitive
	// for 'saturation' than the built-in property.
}
