/**
 * @file src/routes/(app)/imageEditor/widgets/Crop/aspect.ts
 * @description Aspect ratio parser for Konva
 *
 * Features:
 * - Parse aspect ratio string into numeric ratio or null
 */
export function parseAspectRatio(ratio: string | null): number | null {
	if (!ratio || ratio === 'free') return null;
	const parts = ratio.split(':').map((p) => Number(p));
	if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]) || parts[1] === 0) return null;
	return parts[0] / parts[1];
}
