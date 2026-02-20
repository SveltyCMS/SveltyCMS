/**
 * @file src/utils/screenSize.ts
 * @description Screen size utilities - breakpoints and size detection
 *
 * This file contains pure functions and enums for screen size detection,
 * separated from the reactive Svelte store for better testability.
 */

// Enum for screen sizes (matches Tailwind CSS breakpoints)
export enum ScreenSize {
	XS = 'XS',
	SM = 'SM',
	MD = 'MD',
	LG = 'LG',
	XL = 'XL',
	XXL = '2XL'
}

// Screen size breakpoints matching Tailwind CSS
export const BREAKPOINTS = {
	[ScreenSize.XS]: 0,
	[ScreenSize.SM]: 640,
	[ScreenSize.MD]: 768,
	[ScreenSize.LG]: 1024,
	[ScreenSize.XL]: 1280,
	[ScreenSize.XXL]: 1536
} as const;

/**
 * Helper function to calculate screen size from width
 * @param width - The screen width in pixels
 * @returns The corresponding ScreenSize enum value
 */
export function getScreenSize(width: number): ScreenSize {
	if (width < BREAKPOINTS[ScreenSize.SM]) {
		return ScreenSize.XS;
	}
	if (width < BREAKPOINTS[ScreenSize.MD]) {
		return ScreenSize.SM;
	}
	if (width < BREAKPOINTS[ScreenSize.LG]) {
		return ScreenSize.MD;
	}
	if (width < BREAKPOINTS[ScreenSize.XL]) {
		return ScreenSize.LG;
	}
	if (width < BREAKPOINTS[ScreenSize.XXL]) {
		return ScreenSize.XL;
	}
	return ScreenSize.XXL;
}
