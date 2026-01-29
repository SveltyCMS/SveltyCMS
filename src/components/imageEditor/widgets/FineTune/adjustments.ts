/**
 * @file src/components/imageEditor/widgets/FineTune/adjustments.ts
 * @description Adjustment definitions and presets
 */

export interface Adjustments {
	brightness: number;
	contrast: number;
	saturation: number;
	temperature: number;
	exposure: number;
	highlights: number;
	shadows: number;
	clarity: number;
	vibrance: number;
	tint?: number; // Green/Magenta
	sharpness?: number;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	temperature: 0,
	exposure: 0,
	highlights: 0,
	shadows: 0,
	clarity: 0,
	vibrance: 0,
	tint: 0,
	sharpness: 0
};

export interface AdjustmentConfig {
	key: keyof Adjustments;
	label: string;
	icon: string;
	min: number;
	max: number;
	step: number;
	category: 'basic' | 'tone' | 'color' | 'detail';
	description?: string;
}

export const ADJUSTMENT_CONFIGS: AdjustmentConfig[] = [
	// Basic
	{
		key: 'brightness',
		label: 'Brightness',
		icon: 'mdi:brightness-6',
		min: -100,
		max: 100,
		step: 1,
		category: 'basic',
		description: 'Overall image brightness'
	},
	{
		key: 'contrast',
		label: 'Contrast',
		icon: 'mdi:contrast-box',
		min: -100,
		max: 100,
		step: 1,
		category: 'basic',
		description: 'Difference between light and dark'
	},
	{
		key: 'exposure',
		label: 'Exposure',
		icon: 'mdi:brightness-7',
		min: -100,
		max: 100,
		step: 1,
		category: 'basic',
		description: 'Overall lightness'
	},

	// Tone
	{
		key: 'highlights',
		label: 'Highlights',
		icon: 'mdi:white-balance-sunny',
		min: -100,
		max: 100,
		step: 1,
		category: 'tone',
		description: 'Brightest areas'
	},
	{
		key: 'shadows',
		label: 'Shadows',
		icon: 'mdi:weather-night',
		min: -100,
		max: 100,
		step: 1,
		category: 'tone',
		description: 'Darkest areas'
	},

	// Color
	{
		key: 'saturation',
		label: 'Saturation',
		icon: 'mdi:palette',
		min: -100,
		max: 100,
		step: 1,
		category: 'color',
		description: 'Color intensity'
	},
	{
		key: 'vibrance',
		label: 'Vibrance',
		icon: 'mdi:vibrate',
		min: -100,
		max: 100,
		step: 1,
		category: 'color',
		description: 'Smart saturation boost'
	},
	{
		key: 'temperature',
		label: 'Temperature',
		icon: 'mdi:thermometer',
		min: -100,
		max: 100,
		step: 1,
		category: 'color',
		description: 'Warm/Cool color balance'
	},
	{
		key: 'tint',
		label: 'Tint',
		icon: 'mdi:invert-colors',
		min: -100,
		max: 100,
		step: 1,
		category: 'color',
		description: 'Green/Magenta balance'
	},

	// Detail
	{
		key: 'clarity',
		label: 'Clarity',
		icon: 'mdi:crystal-ball',
		min: -100,
		max: 100,
		step: 1,
		category: 'detail',
		description: 'Mid-tone contrast'
	},
	{
		key: 'sharpness',
		label: 'Sharpness',
		icon: 'mdi:image-filter-center-focus',
		min: 0,
		max: 100,
		step: 1,
		category: 'detail',
		description: 'Edge definition'
	}
];

// Filter presets
export interface FilterPreset {
	name: string;
	icon: string;
	description: string;
	adjustments: Partial<Adjustments>;
}

export const FILTER_PRESETS: FilterPreset[] = [
	{
		name: 'Vivid',
		icon: 'mdi:palette-swatch',
		description: 'Boost colors and contrast',
		adjustments: {
			saturation: 20,
			vibrance: 30,
			contrast: 10,
			clarity: 15
		}
	},
	{
		name: 'Black & White',
		icon: 'mdi:square-opacity',
		description: 'Classic monochrome',
		adjustments: {
			saturation: -100,
			contrast: 20,
			clarity: 10
		}
	},
	{
		name: 'Warm',
		icon: 'mdi:weather-sunny',
		description: 'Golden hour glow',
		adjustments: {
			temperature: 30,
			highlights: -10,
			shadows: 10,
			vibrance: 15
		}
	},
	{
		name: 'Cool',
		icon: 'mdi:snowflake',
		description: 'Cool blue tones',
		adjustments: {
			temperature: -30,
			tint: -10,
			shadows: -5
		}
	},
	{
		name: 'Vintage',
		icon: 'mdi:camera-retro',
		description: 'Faded film look',
		adjustments: {
			contrast: -15,
			saturation: -20,
			temperature: 15,
			highlights: -20,
			shadows: 15
		}
	},
	{
		name: 'Dramatic',
		icon: 'mdi:flash',
		description: 'High contrast punch',
		adjustments: {
			contrast: 40,
			clarity: 30,
			shadows: -20,
			highlights: -10
		}
	},
	{
		name: 'Soft',
		icon: 'mdi:blur',
		description: 'Gentle and dreamy',
		adjustments: {
			contrast: -10,
			clarity: -20,
			highlights: 10,
			saturation: -10
		}
	},
	{
		name: 'Portrait',
		icon: 'mdi:account',
		description: 'Flattering skin tones',
		adjustments: {
			shadows: 15,
			highlights: -5,
			temperature: 10,
			clarity: -5,
			vibrance: 10
		}
	}
];

/**
 * Get adjustment config by key
 */
export function getAdjustmentConfig(key: keyof Adjustments): AdjustmentConfig | undefined {
	return ADJUSTMENT_CONFIGS.find((config) => config.key === key);
}

/**
 * Get adjustments by category
 */
export function getAdjustmentsByCategory(category: AdjustmentConfig['category']): AdjustmentConfig[] {
	return ADJUSTMENT_CONFIGS.filter((config) => config.category === category);
}

/**
 * Validate adjustment value
 */
export function clampAdjustment(key: keyof Adjustments, value: number): number {
	const config = getAdjustmentConfig(key);
	if (!config) return value;
	return Math.max(config.min, Math.min(config.max, value));
}

/**
 * Check if adjustments are at default
 */
export function isDefault(adjustments: Adjustments): boolean {
	return Object.entries(adjustments).every(([key, value]) => value === DEFAULT_ADJUSTMENTS[key as keyof Adjustments]);
}

/**
 * Reset specific category
 */
export function resetCategory(adjustments: Adjustments, category: AdjustmentConfig['category']): Adjustments {
	const updated = { ...adjustments };
	getAdjustmentsByCategory(category).forEach((config) => {
		const key = config.key;
		updated[key] = DEFAULT_ADJUSTMENTS[key] ?? 0;
	});
	return updated;
}
