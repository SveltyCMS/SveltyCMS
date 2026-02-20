/**
 * @file src/components/image-editor/widgets/Crop/aspect.ts
 * @description Aspect ratio utilities with common presets
 */

export interface AspectRatioPreset {
	description?: string;
	icon?: string;
	label: string;
	value: number | null;
}

/**
 * Common aspect ratio presets
 */
export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
	{
		label: 'Free',
		value: null,
		icon: 'mdi:crop-free',
		description: 'Any aspect ratio'
	},
	{ label: '1:1', value: 1, icon: 'mdi:crop-square', description: 'Square' },
	{ label: '4:3', value: 4 / 3, description: 'Standard' },
	{ label: '16:9', value: 16 / 9, description: 'Widescreen' },
	{ label: '3:2', value: 3 / 2, description: 'Photo' },
	{ label: '2:3', value: 2 / 3, description: 'Portrait' },
	{ label: '9:16', value: 9 / 16, description: 'Vertical video' },
	{ label: '21:9', value: 21 / 9, description: 'Ultrawide' },
	{ label: '2.35:1', value: 2.35, description: 'Cinematic' }
];

/**
 * Parse aspect ratio string into numeric ratio
 *
 * @param ratio - Aspect ratio string (e.g., "16:9", "free")
 * @returns Numeric ratio or null for free aspect
 */
export function parseAspectRatio(ratio: string | null): number | null {
	if (!ratio || ratio === 'free') {
		return null;
	}

	// Handle decimal format (e.g., "2.35")
	const decimal = Number.parseFloat(ratio);
	if (!Number.isNaN(decimal) && decimal > 0) {
		return decimal;
	}

	// Handle ratio format (e.g., "16:9")
	const parts = ratio.split(':').map((p) => Number(p));
	if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]) || parts[1] === 0) {
		return null;
	}

	return parts[0] / parts[1];
}

/**
 * Format numeric ratio as string
 *
 * @param ratio - Numeric ratio
 * @returns Formatted string (e.g., "16:9")
 */
export function formatAspectRatio(ratio: number | null): string {
	if (ratio === null) {
		return 'free';
	}

	// Find exact match in presets
	const preset = ASPECT_RATIO_PRESETS.find((p) => p.value === ratio);
	if (preset) {
		return preset.label;
	}

	// Try to find simple ratio
	for (let denominator = 1; denominator <= 20; denominator++) {
		const numerator = Math.round(ratio * denominator);
		if (Math.abs(numerator / denominator - ratio) < 0.001) {
			return `${numerator}:${denominator}`;
		}
	}

	// Fallback to decimal
	return ratio.toFixed(2);
}

/**
 * Get closest preset for a given ratio
 */
export function getClosestPreset(ratio: number): AspectRatioPreset {
	let closest = ASPECT_RATIO_PRESETS[0];
	let minDiff = Number.POSITIVE_INFINITY;

	for (const preset of ASPECT_RATIO_PRESETS) {
		if (preset.value === null) {
			continue;
		}
		const diff = Math.abs(preset.value - ratio);
		if (diff < minDiff) {
			minDiff = diff;
			closest = preset;
		}
	}

	return closest;
}
