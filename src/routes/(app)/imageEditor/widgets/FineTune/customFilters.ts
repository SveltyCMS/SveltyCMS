/**
 * @file src/routes/(app)/imageEditor/widgets/FineTune/filters/customFilters.ts
 * @description Custom pixel-level filter logic for exposure, shadows, clarity.
 *
 * Features:
 * - Custom pixel-level filter logic for exposure, shadows, clarity.
 */
import type { Adjustments } from './adjustments';

/**
 * Creates a slow, pixel-looping filter function for Konva
 * to handle adjustments not built-in (exposure, shadows, etc.).
 */
export function createCustomFilter(adj: Adjustments) {
	// Pre-calculate factors for performance
	const expFactor = 1 + adj.exposure / 100;
	const highFactor = 1 + adj.highlights / 100;
	const shadowFactor = 1 + adj.shadows / 100;
	const clarityFactor = 1 + adj.clarity / 100;
	const mid = 128;

	return function (imageData: ImageData) {
		const data = imageData.data;

		for (let i = 0; i < data.length; i += 4) {
			let r = data[i];
			let g = data[i + 1];
			let b = data[i + 2];

			// 1. Exposure (simple multiply)
			if (adj.exposure !== 0) {
				r *= expFactor;
				g *= expFactor;
				b *= expFactor;
			}

			// Get perceived brightness (luminance)
			const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

			// 2. Highlights (affect bright areas)
			if (adj.highlights !== 0 && brightness > 150) {
				// Target brights
				const highAmount = (brightness - 150) / 105; // 0..1
				const factor = 1 + (highFactor - 1) * highAmount;
				r *= factor;
				g *= factor;
				b *= factor;
			}

			// 3. Shadows (affect dark areas)
			if (adj.shadows !== 0 && brightness < 100) {
				// Target darks
				const shadowAmount = (100 - brightness) / 100; // 0..1
				const factor = 1 + (shadowFactor - 1) * shadowAmount;
				r *= factor;
				g *= factor;
				b *= factor;
			}

			// 4. Clarity (increases mid-tone contrast)
			if (adj.clarity !== 0) {
				r = mid + (r - mid) * clarityFactor;
				g = mid + (g - mid) * clarityFactor;
				b = mid + (b - mid) * clarityFactor;
			}

			// Clamp values
			data[i] = Math.min(255, Math.max(0, r));
			data[i + 1] = Math.min(255, Math.max(0, g));
			data[i + 2] = Math.min(255, Math.max(0, b));
		}
	};
}
