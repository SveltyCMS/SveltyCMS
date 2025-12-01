/**
 * @file src/routes/(app)/imageEditor/widgets/FineTune/controls/adjustments.ts
 * @description Central adjustment definitions used by FineTune tool.
 *
 * Features:
 * - Central adjustment definitions used by FineTune tool.
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
	vibrance: 0
};

export const ADJUSTMENT_OPTIONS = [
	{ key: 'brightness', label: 'Brightness' },
	{ key: 'contrast', label: 'Contrast' },
	{ key: 'saturation', label: 'Saturation' },
	{ key: 'temperature', label: 'Temperature' },
	{ key: 'exposure', label: 'Exposure' },
	{ key: 'highlights', label: 'Highlights' },
	{ key: 'shadows', label: 'Shadows' },
	{ key: 'clarity', label: 'Clarity' },
	{ key: 'vibrance', label: 'Vibrance' }
] as const;
