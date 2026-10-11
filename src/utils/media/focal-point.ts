/**
 * @file src/utils/media/focal-point.ts
 * @description Focal point is a percentage of the image, 0–100 on both axes.
 *
 * Older editor state stored a 0–1 fraction (`{ x: 0.5, y: 0.5 }`). Values that
 * are not integers and sit inside the unit interval are scaled up. Integer
 * percentages such as `{ x: 1, y: 1 }` stay 1%.
 */

export interface FocalPercent {
  x: number;
  y: number;
}

function isFractionalUnit(value: number): boolean {
  return value >= 0 && value <= 1 && !Number.isInteger(value);
}

export function normalizeFocalPercent(
  point: { x: number; y: number } | null | undefined,
): FocalPercent {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return { x: 50, y: 50 };
  }

  const scale = isFractionalUnit(point.x) || isFractionalUnit(point.y) ? 100 : 1;
  return {
    x: Math.max(0, Math.min(100, Math.round(point.x * scale))),
    y: Math.max(0, Math.min(100, Math.round(point.y * scale))),
  };
}
